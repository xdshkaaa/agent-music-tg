import { describe, expect, test } from "bun:test";
import { mkdtempSync, existsSync } from "node:fs";
import { writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";

const { openDb } = await import("../db");
const { isValidTrackUri, sourceUrlForUri, fileNameForUri } = await import("./extractor");
const { getCachedAudio, setCachedAudio } = await import("./cache");
const {
  insertDownload,
  getDownload,
  listDownloads,
  deleteDownload,
  hasActiveDownload,
  finalStatusFor,
} = await import("./downloads-store");
const { processDownload } = await import("./deliver");
const { StreamCache } = await import("./stream-cache");

import type { Extractor } from "./extractor";
import type { AudioSender } from "./deliver";
import type { DownloadTrack } from "./downloads-store";

const CHAT = 111;

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "audio-test-"));
}

/** Extractor that writes a small fake mp3 (or fails for chosen uris). */
function fakeExtractor(opts: { failUris?: string[]; sizeBytes?: number } = {}): Extractor & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async extract(uri, targetDir) {
      calls.push(uri);
      if (opts.failUris?.includes(uri)) throw new Error(`extract failed: ${uri}`);
      const filePath = join(targetDir, fileNameForUri(uri));
      await writeFile(filePath, Buffer.alloc(opts.sizeBytes ?? 16, 1));
      return { filePath, sizeBytes: opts.sizeBytes ?? 16 };
    },
  };
}

function fakeSender(opts: { failFileIds?: string[] } = {}) {
  const sent: { kind: "file_id" | "upload" | "text"; value: string }[] = [];
  let uploadCount = 0;
  const sender: AudioSender = {
    async sendAudioByFileId(_chatId, fileId) {
      if (opts.failFileIds?.includes(fileId)) throw new Error("stale file_id");
      sent.push({ kind: "file_id", value: fileId });
    },
    async sendAudioFile(_chatId, filePath) {
      sent.push({ kind: "upload", value: filePath });
      return `file-id-${++uploadCount}`;
    },
    async sendText(_chatId, text) {
      sent.push({ kind: "text", value: text });
    },
  };
  return { sender, sent };
}

function track(uri: string): Omit<DownloadTrack, "status"> {
  return { uri, title: `t-${uri}`, artist: `a-${uri}` };
}

describe("extractor uri handling", () => {
  test("validates uris strictly", () => {
    expect(isValidTrackUri("ytm:dQw4w9WgXcQ")).toBe(true);
    expect(isValidTrackUri("sc:12345")).toBe(true);
    expect(isValidTrackUri("spotify:track:x")).toBe(false);
    expect(isValidTrackUri("ytm:has space")).toBe(false);
    expect(isValidTrackUri("https://evil.example")).toBe(false);
    expect(isValidTrackUri("ytm:")).toBe(false);
  });

  test("maps uris to source urls and rejects invalid ones", () => {
    expect(sourceUrlForUri("ytm:abc-123")).toBe("https://music.youtube.com/watch?v=abc-123");
    expect(sourceUrlForUri("sc:42")).toBe("https://api.soundcloud.com/tracks/42");
    expect(() => sourceUrlForUri("ftp:nope")).toThrow();
  });
});

describe("audio_cache helpers", () => {
  test("set/get roundtrip and upsert refresh", () => {
    const db = openDb(":memory:");
    expect(getCachedAudio(db, "ytm:x")).toBeNull();
    setCachedAudio(db, { uri: "ytm:x", tgFileId: "f1", title: "T", artist: "A", durationMs: 1000, sizeBytes: 5 });
    expect(getCachedAudio(db, "ytm:x")?.tgFileId).toBe("f1");
    setCachedAudio(db, { uri: "ytm:x", tgFileId: "f2", title: "T", artist: "A", durationMs: 1000, sizeBytes: 5 });
    expect(getCachedAudio(db, "ytm:x")?.tgFileId).toBe("f2");
  });
});

describe("downloads store", () => {
  test("insert/list/get are owner-scoped", () => {
    const db = openDb(":memory:");
    const mine = insertDownload(db, CHAT, "P1", [track("ytm:a")]);
    insertDownload(db, 222, "P2", [track("ytm:b")]);

    expect(listDownloads(db, CHAT).map((d) => d.id)).toEqual([mine.id]);
    expect(getDownload(db, CHAT, mine.id)?.playlistName).toBe("P1");
    expect(getDownload(db, 222, mine.id)).toBeNull();
  });

  test("delete is owner-scoped and reports misses", () => {
    const db = openDb(":memory:");
    const mine = insertDownload(db, CHAT, "P1", [track("ytm:a")]);
    expect(deleteDownload(db, 222, mine.id)).toBe(false);
    expect(deleteDownload(db, CHAT, mine.id)).toBe(true);
    expect(listDownloads(db, CHAT)).toHaveLength(0);
  });

  test("hasActiveDownload tracks pending/processing only", () => {
    const db = openDb(":memory:");
    expect(hasActiveDownload(db, CHAT)).toBe(false);
    insertDownload(db, CHAT, "P", [track("ytm:a")]);
    expect(hasActiveDownload(db, CHAT)).toBe(true);
  });

  test("finalStatusFor maps outcomes", () => {
    const sent: DownloadTrack = { ...track("ytm:a"), status: "sent" };
    const failed: DownloadTrack = { ...track("ytm:b"), status: "failed" };
    expect(finalStatusFor([sent, sent])).toBe("done");
    expect(finalStatusFor([sent, failed])).toBe("partial");
    expect(finalStatusFor([failed])).toBe("failed");
  });
});

describe("processDownload", () => {
  test("uploads uncached tracks, caches file_id, deletes local file, sends summary", async () => {
    const db = openDb(":memory:");
    const extractor = fakeExtractor();
    const { sender, sent } = fakeSender();
    const dir = scratch();
    const record = insertDownload(db, CHAT, "P", [track("ytm:a"), track("ytm:b")]);

    await processDownload(db, record, { sender, extractor, scratchDir: dir });

    const done = getDownload(db, CHAT, record.id)!;
    expect(done.status).toBe("done");
    expect(done.tracks.every((t) => t.status === "sent")).toBe(true);
    expect(getCachedAudio(db, "ytm:a")?.tgFileId).toBe("file-id-1");
    expect(existsSync(join(dir, fileNameForUri("ytm:a")))).toBe(false);
    expect(sent.filter((s) => s.kind === "upload")).toHaveLength(2);
    expect(sent.at(-1)?.kind).toBe("text");
  });

  test("cache hit sends by file_id without extraction", async () => {
    const db = openDb(":memory:");
    setCachedAudio(db, { uri: "ytm:a", tgFileId: "cached-1", title: "T", artist: "A", durationMs: null, sizeBytes: null });
    const extractor = fakeExtractor();
    const { sender, sent } = fakeSender();
    const record = insertDownload(db, CHAT, "P", [track("ytm:a")]);

    await processDownload(db, record, { sender, extractor, scratchDir: scratch() });

    expect(extractor.calls).toHaveLength(0);
    expect(sent[0]).toEqual({ kind: "file_id", value: "cached-1" });
    expect(getDownload(db, CHAT, record.id)!.status).toBe("done");
  });

  test("stale file_id falls back to re-upload and refreshes cache", async () => {
    const db = openDb(":memory:");
    setCachedAudio(db, { uri: "ytm:a", tgFileId: "stale", title: "T", artist: "A", durationMs: null, sizeBytes: null });
    const extractor = fakeExtractor();
    const { sender } = fakeSender({ failFileIds: ["stale"] });
    const record = insertDownload(db, CHAT, "P", [track("ytm:a")]);

    await processDownload(db, record, { sender, extractor, scratchDir: scratch() });

    expect(extractor.calls).toEqual(["ytm:a"]);
    expect(getCachedAudio(db, "ytm:a")?.tgFileId).toBe("file-id-1");
    expect(getDownload(db, CHAT, record.id)!.status).toBe("done");
  });

  test("per-track failure yields partial with per-track statuses", async () => {
    const db = openDb(":memory:");
    const extractor = fakeExtractor({ failUris: ["ytm:bad"] });
    const { sender, sent } = fakeSender();
    const record = insertDownload(db, CHAT, "P", [track("ytm:ok"), track("ytm:bad")]);

    await processDownload(db, record, { sender, extractor, scratchDir: scratch() });

    const done = getDownload(db, CHAT, record.id)!;
    expect(done.status).toBe("partial");
    expect(done.tracks.find((t) => t.uri === "ytm:ok")?.status).toBe("sent");
    const bad = done.tracks.find((t) => t.uri === "ytm:bad")!;
    expect(bad.status).toBe("failed");
    expect(bad.error).toContain("extract failed");
    expect(sent.at(-1)?.value).toContain("1 из 2");
  });

  test("oversized file is failed, not uploaded", async () => {
    const db = openDb(":memory:");
    const extractor = fakeExtractor({ sizeBytes: 51 * 1024 * 1024 });
    const { sender, sent } = fakeSender();
    const record = insertDownload(db, CHAT, "P", [track("ytm:big")]);

    await processDownload(db, record, { sender, extractor, scratchDir: scratch() });

    expect(getDownload(db, CHAT, record.id)!.status).toBe("failed");
    expect(sent.filter((s) => s.kind === "upload")).toHaveLength(0);
  });
});

describe("stream cache", () => {
  test("extracts on miss, serves cached on hit", async () => {
    const extractor = fakeExtractor();
    const cache = new StreamCache(extractor, { dir: scratch(), maxBytes: 10_000, ttlSeconds: 3600 });
    const p1 = await cache.getFile("ytm:a");
    const p2 = await cache.getFile("ytm:a");
    expect(p1).toBe(p2);
    expect(extractor.calls).toEqual(["ytm:a"]);
  });

  test("evicts LRU files past the size cap", async () => {
    const extractor = fakeExtractor({ sizeBytes: 100 });
    const dir = scratch();
    const cache = new StreamCache(extractor, { dir, maxBytes: 250, ttlSeconds: 3600 });
    const pa = await cache.getFile("ytm:a");
    // Age "a" so it is clearly the LRU entry.
    const old = new Date(Date.now() - 60_000);
    await utimes(pa, old, old);
    await cache.getFile("ytm:b");
    await cache.getFile("ytm:c"); // 300 bytes total -> evict oldest (a)
    expect(existsSync(join(dir, fileNameForUri("ytm:a")))).toBe(false);
    expect(existsSync(join(dir, fileNameForUri("ytm:c")))).toBe(true);
  });

  test("expired files are re-extracted", async () => {
    const extractor = fakeExtractor();
    const dir = scratch();
    const cache = new StreamCache(extractor, { dir, maxBytes: 10_000, ttlSeconds: 1 });
    const p = await cache.getFile("ytm:a");
    const old = new Date(Date.now() - 10_000);
    await utimes(p, old, old);
    await cache.getFile("ytm:a");
    expect(extractor.calls).toEqual(["ytm:a", "ytm:a"]);
  });
});
