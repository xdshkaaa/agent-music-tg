import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";
const TEST_CHAT = 555555;
const OTHER_CHAT = 666666;

const { env } = await import("../env");
const { openDb } = await import("../db");
const { upsertUser } = await import("../access/users-store");
const { createApiRoutes } = await import("./routes");
const { setCachedAudio, getCachedAudio } = await import("../audio/cache");
const { insertDownload, getDownload, setDownloadStatus } = await import("../audio/downloads-store");
const { fileNameForUri } = await import("../audio/extractor");
const { StreamCache } = await import("../audio/stream-cache");

import type { Extractor } from "../audio/extractor";
import type { AudioSender } from "../audio/deliver";
import type { AudioDeps } from "./audio-routes";

function buildInitData(chatId: number): string {
  const params = new URLSearchParams();
  params.set("auth_date", String(Math.floor(Date.now() / 1000)));
  params.set("user", JSON.stringify({ id: chatId, first_name: "Test" }));
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(env.telegramBotToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

function authHeaders(chatId: number): Record<string, string> {
  return { "X-Telegram-Init-Data": buildInitData(chatId), "content-type": "application/json" };
}

function freshDb() {
  const db = openDb(":memory:");
  for (const chat of [TEST_CHAT, OTHER_CHAT]) {
    db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [chat]);
    upsertUser(db, chat); // signup bonus credits -> hasAccess passes
  }
  return db;
}

function fakeExtractor(content = "mp3-bytes"): Extractor {
  return {
    async extract(uri, targetDir) {
      const filePath = join(targetDir, fileNameForUri(uri));
      await writeFile(filePath, content);
      return { filePath, sizeBytes: Buffer.byteLength(content) };
    },
  };
}

function fakeSender(): AudioSender & { texts: string[] } {
  const texts: string[] = [];
  let n = 0;
  return {
    texts,
    async sendAudioByFileId() {},
    async sendAudioFile() {
      return `file-id-${++n}`;
    },
    async sendText(_chatId, text) {
      texts.push(text);
    },
  };
}

function makeApp(db: ReturnType<typeof freshDb>) {
  const extractor = fakeExtractor();
  const audio: AudioDeps = {
    sender: fakeSender(),
    extractor,
    scratchDir: mkdtempSync(join(tmpdir(), "audio-scratch-")),
    streamCache: new StreamCache(extractor, {
      dir: mkdtempSync(join(tmpdir(), "stream-cache-")),
      maxBytes: 10_000,
      ttlSeconds: 3600,
    }),
  };
  return createApiRoutes(db, { audio });
}

async function waitForFinal(db: ReturnType<typeof freshDb>, chatId: number, id: number): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const status = getDownload(db, chatId, id)?.status;
    if (status && status !== "pending" && status !== "processing") return status;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("download never finalized");
}

describe("POST /api/download", () => {
  test("accepts a valid playlist and completes the job", async () => {
    const db = freshDb();
    const app = makeApp(db);
    const res = await app.request("/download", {
      method: "POST",
      headers: authHeaders(TEST_CHAT),
      body: JSON.stringify({ playlistName: "P", tracks: [{ uri: "ytm:abc", title: "T", artist: "A" }] }),
    });
    expect(res.status).toBe(202);
    const { downloadId } = (await res.json()) as { downloadId: number };
    expect(await waitForFinal(db, TEST_CHAT, downloadId)).toBe("done");
  });

  test("rejects invalid track uris with 400 and no record", async () => {
    const db = freshDb();
    const app = makeApp(db);
    const res = await app.request("/download", {
      method: "POST",
      headers: authHeaders(TEST_CHAT),
      body: JSON.stringify({ playlistName: "P", tracks: [{ uri: "https://evil.example" }] }),
    });
    expect(res.status).toBe(400);
    const list = await app.request("/downloads", { headers: authHeaders(TEST_CHAT) });
    expect(((await list.json()) as { downloads: unknown[] }).downloads).toHaveLength(0);
  });

  test("rejects a concurrent job with 409", async () => {
    const db = freshDb();
    const app = makeApp(db);
    // Simulate an in-flight job.
    const active = insertDownload(db, TEST_CHAT, "Busy", [{ uri: "ytm:x", title: "T", artist: "A" }]);
    setDownloadStatus(db, active.id, "processing");

    const res = await app.request("/download", {
      method: "POST",
      headers: authHeaders(TEST_CHAT),
      body: JSON.stringify({ playlistName: "P", tracks: [{ uri: "ytm:abc" }] }),
    });
    expect(res.status).toBe(409);
  });
});

describe("downloads history API", () => {
  test("lists own downloads only, newest first", async () => {
    const db = freshDb();
    const app = makeApp(db);
    insertDownload(db, TEST_CHAT, "Mine", [{ uri: "ytm:a", title: "T", artist: "A" }]);
    insertDownload(db, OTHER_CHAT, "Theirs", [{ uri: "ytm:b", title: "T", artist: "A" }]);

    const res = await app.request("/downloads", { headers: authHeaders(TEST_CHAT) });
    const body = (await res.json()) as { downloads: { playlistName: string }[] };
    expect(body.downloads.map((d) => d.playlistName)).toEqual(["Mine"]);
  });

  test("resend rejects a foreign id with 404", async () => {
    const db = freshDb();
    const app = makeApp(db);
    const theirs = insertDownload(db, OTHER_CHAT, "Theirs", [{ uri: "ytm:b", title: "T", artist: "A" }]);
    setDownloadStatus(db, theirs.id, "done");

    const res = await app.request(`/downloads/${theirs.id}/resend`, { method: "POST", headers: authHeaders(TEST_CHAT) });
    expect(res.status).toBe(404);
  });

  test("resend creates a fresh job over the same tracks", async () => {
    const db = freshDb();
    const app = makeApp(db);
    const mine = insertDownload(db, TEST_CHAT, "Mine", [{ uri: "ytm:a", title: "T", artist: "A" }]);
    setDownloadStatus(db, mine.id, "done");

    const res = await app.request(`/downloads/${mine.id}/resend`, { method: "POST", headers: authHeaders(TEST_CHAT) });
    expect(res.status).toBe(202);
    const { downloadId } = (await res.json()) as { downloadId: number };
    expect(downloadId).not.toBe(mine.id);
    expect(await waitForFinal(db, TEST_CHAT, downloadId)).toBe("done");
  });

  test("delete removes own entry, keeps audio_cache, 404s on foreign id", async () => {
    const db = freshDb();
    const app = makeApp(db);
    setCachedAudio(db, { uri: "ytm:a", tgFileId: "f1", title: "T", artist: "A", durationMs: null, sizeBytes: null });
    const mine = insertDownload(db, TEST_CHAT, "Mine", [{ uri: "ytm:a", title: "T", artist: "A" }]);
    setDownloadStatus(db, mine.id, "done");

    const foreign = await app.request(`/downloads/${mine.id}`, { method: "DELETE", headers: authHeaders(OTHER_CHAT) });
    expect(foreign.status).toBe(404);

    const res = await app.request(`/downloads/${mine.id}`, { method: "DELETE", headers: authHeaders(TEST_CHAT) });
    expect(res.status).toBe(200);
    const list = await app.request("/downloads", { headers: authHeaders(TEST_CHAT) });
    expect(((await list.json()) as { downloads: unknown[] }).downloads).toHaveLength(0);
    expect(getCachedAudio(db, "ytm:a")?.tgFileId).toBe("f1");
  });
});

describe("GET /api/stream/:uri", () => {
  test("serves full file with audio/mpeg", async () => {
    const app = makeApp(freshDb());
    const res = await app.request("/stream/ytm:abc", { headers: authHeaders(TEST_CHAT) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(await res.text()).toBe("mp3-bytes");
  });

  test("honors Range with 206 and Content-Range", async () => {
    const app = makeApp(freshDb());
    const res = await app.request("/stream/ytm:abc", {
      headers: { ...authHeaders(TEST_CHAT), Range: "bytes=0-3" },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-3/9");
    expect(await res.text()).toBe("mp3-");
  });

  test("rejects invalid uri with 400 and unauthenticated with 401", async () => {
    const app = makeApp(freshDb());
    const bad = await app.request("/stream/https%3A%2F%2Fevil", { headers: authHeaders(TEST_CHAT) });
    expect(bad.status).toBe(400);
    const anon = await app.request("/stream/ytm:abc");
    expect(anon.status).toBe(401);
  });
});
