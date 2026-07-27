import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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
const { addSavedTrack } = await import("../access/saved-tracks-store");
const { insertGeneration } = await import("../access/generations-store");
const { streamRateLimiter } = await import("../lib/rate-limit");

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
    async probe() {
      return { available: true };
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
    streamResolver: {
      async resolve() {
        return { url: "https://media.example/audio", headers: {} };
      },
      invalidate() {},
    },
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

  test("a stale processing job (crashed/restarted mid-download) does not block new downloads", async () => {
    const db = freshDb();
    const app = makeApp(db);
    const active = insertDownload(db, TEST_CHAT, "Busy", [{ uri: "ytm:x", title: "T", artist: "A" }]);
    setDownloadStatus(db, active.id, "processing");
    const staleAt = Math.floor((Date.now() - 20 * 60 * 1000) / 1000);
    db.run(`UPDATE downloads SET updated_at = ? WHERE id = ?`, [staleAt, active.id]);

    const res = await app.request("/download", {
      method: "POST",
      headers: authHeaders(TEST_CHAT),
      body: JSON.stringify({ playlistName: "P", tracks: [{ uri: "ytm:abc" }] }),
    });
    expect(res.status).toBe(202);
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
  function makeProxyHarness(responses: Response[], db = freshDb(), opts: { cached?: boolean } = {}) {
    let extractCalls = 0;
    let resolveCalls = 0;
    let invalidateCalls = 0;
    const upstreamRanges: Array<string | null> = [];
    const extractor = fakeExtractor("legacy-mp3");
    const countedExtractor: Extractor = {
      ...extractor,
      async extract(uri, targetDir) {
        extractCalls++;
        return extractor.extract(uri, targetDir);
      },
    };
    const audio = {
      sender: fakeSender(),
      extractor: countedExtractor,
      scratchDir: mkdtempSync(join(tmpdir(), "audio-scratch-")),
      streamResolver: {
        async resolve() {
          resolveCalls++;
          return { url: "https://media.example/audio", headers: { "user-agent": "yt-dlp-test" } };
        },
        invalidate() {
          invalidateCalls++;
        },
        // Omitted unless a case asks for it, so the default harness exercises
        // the resolver-shaped double that predates isCached.
        ...(opts.cached ? { isCached: () => true } : {}),
      },
      async streamFetch(_url: string | URL | Request, init?: RequestInit) {
        upstreamRanges.push(new Headers(init?.headers).get("Range"));
        const response = responses.shift();
        if (!response) throw new Error("unexpected upstream request");
        return response;
      },
    } as AudioDeps;
    return {
      app: createApiRoutes(db, { audio }),
      calls: () => ({ extractCalls, resolveCalls, invalidateCalls, upstreamRanges }),
    };
  }

  test("proxies upstream audio without waiting for MP3 extraction", async () => {
    const { app, calls } = makeProxyHarness([
      new Response("upstream-audio", { headers: { "Content-Type": "audio/mp4", "Content-Length": "14" } }),
    ]);
    const res = await app.request("/stream/ytm:abc", { headers: authHeaders(TEST_CHAT) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mp4");
    expect(await res.text()).toBe("upstream-audio");
    expect(calls()).toEqual({ extractCalls: 0, resolveCalls: 1, invalidateCalls: 0, upstreamRanges: [null] });
  });

  test("forwards Range and preserves the upstream partial response", async () => {
    const { app, calls } = makeProxyHarness([
      new Response("upst", {
        status: 206,
        headers: {
          "Content-Type": "audio/mp4",
          "Accept-Ranges": "bytes",
          "Content-Range": "bytes 0-3/14",
          "Content-Length": "4",
        },
      }),
    ]);
    const res = await app.request("/stream/ytm:abc", {
      headers: { ...authHeaders(TEST_CHAT), Range: "bytes=0-3" },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-3/14");
    expect(await res.text()).toBe("upst");
    expect(calls().upstreamRanges).toEqual(["bytes=0-3"]);
  });

  test("preserves an upstream unsatisfiable Range response", async () => {
    const { app } = makeProxyHarness([
      new Response(null, { status: 416, headers: { "Content-Range": "bytes */14" } }),
    ]);
    const res = await app.request("/stream/ytm:abc", {
      headers: { ...authHeaders(TEST_CHAT), Range: "bytes=99-100" },
    });
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */14");
  });

  test("re-resolves once when a cached upstream URL has expired", async () => {
    const { app, calls } = makeProxyHarness([
      new Response("expired", { status: 403 }),
      new Response("fresh-audio", { headers: { "Content-Type": "audio/mp4" } }),
    ]);
    const res = await app.request("/stream/ytm:abc", { headers: authHeaders(TEST_CHAT) });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("fresh-audio");
    expect(calls()).toEqual({ extractCalls: 0, resolveCalls: 2, invalidateCalls: 1, upstreamRanges: [null, null] });
  });

  test("rejects invalid uri with 400 and unauthenticated with 401", async () => {
    const app = makeApp(freshDb());
    const bad = await app.request("/stream/https%3A%2F%2Fevil", { headers: authHeaders(TEST_CHAT) });
    expect(bad.status).toBe(400);
    const anon = await app.request("/stream/ytm:abc");
    expect(anon.status).toBe(401);
  });

  test("hides yt-dlp stderr from the client when resolving fails", async () => {
    const audio = {
      sender: fakeSender(),
      extractor: fakeExtractor(),
      scratchDir: mkdtempSync(join(tmpdir(), "audio-scratch-")),
      streamResolver: {
        async resolve() {
          throw new Error("yt-dlp stream resolve failed for ytm:abc (exit 1): /opt/secret/path cookies missing");
        },
        invalidate() {},
      },
    } as unknown as AudioDeps;
    const app = createApiRoutes(freshDb(), { audio });
    const res = await app.request("/stream/ytm:abc", { headers: authHeaders(TEST_CHAT) });
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).not.toContain("/opt/secret/path");
    expect(body).not.toContain("yt-dlp");
  });

  describe("entitlement", () => {
    /** Allowlisted chat with no credits, no trial and no subscription. */
    function brokeDb() {
      const db = freshDb();
      db.run(
        "UPDATE users SET credits = 0, trial_credits = 0, trial_until = NULL, subscription_until = NULL WHERE chat_id = ?",
        [TEST_CHAT],
      );
      return db;
    }

    let paymentsWasEnabled = true;
    beforeEach(() => {
      paymentsWasEnabled = env.paymentsEnabled;
      env.paymentsEnabled = true;
      streamRateLimiter.reset();
    });
    afterEach(() => {
      env.paymentsEnabled = paymentsWasEnabled;
      streamRateLimiter.reset();
    });

    test("refuses a track the user neither owns nor can pay for", async () => {
      const { app, calls } = makeProxyHarness([], brokeDb());
      const res = await app.request("/stream/ytm:abc", { headers: authHeaders(TEST_CHAT) });
      expect(res.status).toBe(403);
      // The gate must run before yt-dlp is ever spawned.
      expect(calls().resolveCalls).toBe(0);
    });

    test("still streams a track the user saved earlier, with no credits left", async () => {
      const db = brokeDb();
      addSavedTrack(db, TEST_CHAT, { uri: "ytm:abc", title: "T", artist: "A", artwork: null });
      const { app } = makeProxyHarness([new Response("owned", { headers: { "Content-Type": "audio/mp4" } })], db);
      const res = await app.request("/stream/ytm:abc", { headers: authHeaders(TEST_CHAT) });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("owned");
    });

    test("still streams a track from the user's own past generation", async () => {
      const db = brokeDb();
      insertGeneration(db, TEST_CHAT, "прогулка", "Вечер", 1, [
        { uri: "ytm:gen_1", title: "T", artist: "A" },
      ]);
      const { app } = makeProxyHarness([new Response("owned", { headers: { "Content-Type": "audio/mp4" } })], db);
      const res = await app.request("/stream/ytm:gen_1", { headers: authHeaders(TEST_CHAT) });
      expect(res.status).toBe(200);
    });

    test("does not leak another chat's generation as ownership", async () => {
      const db = brokeDb();
      insertGeneration(db, OTHER_CHAT, "чужое", "Чужой", 1, [{ uri: "ytm:other_1", title: "T", artist: "A" }]);
      const { app } = makeProxyHarness([], db);
      const res = await app.request("/stream/ytm:other_1", { headers: authHeaders(TEST_CHAT) });
      expect(res.status).toBe(403);
    });

    test("a cached track never spends throttle budget, however often it is re-requested", async () => {
      // The limiter exists to bound yt-dlp spawns. Scrubbing around inside one
      // already-resolved song issues many Range requests that spawn nothing, so
      // charging them would 429 a listener who cost the box no work at all.
      const db = freshDb();
      const responses = Array.from({ length: 90 }, () => new Response("a", { headers: { "Content-Type": "audio/mp4" } }));
      const { app } = makeProxyHarness(responses, db, { cached: true });
      const statuses: number[] = [];
      for (let i = 0; i < 80; i++) {
        const res = await app.request("/stream/ytm:abc", {
          headers: { ...authHeaders(TEST_CHAT), Range: `bytes=${i * 100}-` },
        });
        statuses.push(res.status);
        await res.arrayBuffer();
      }
      expect(statuses.every((s) => s === 200)).toBe(true);
    });

    test("throttles a caller walking distinct uris", async () => {
      const db = freshDb(); // has credits, so only the throttle can stop it
      const responses = Array.from({ length: 80 }, () => new Response("a", { headers: { "Content-Type": "audio/mp4" } }));
      const { app } = makeProxyHarness(responses, db);
      const statuses: number[] = [];
      for (let i = 0; i < 65; i++) {
        const res = await app.request(`/stream/ytm:t${i}`, { headers: authHeaders(TEST_CHAT) });
        statuses.push(res.status);
        await res.arrayBuffer();
      }
      expect(statuses.filter((s) => s === 200).length).toBe(60);
      expect(statuses.filter((s) => s === 429).length).toBe(5);
    });
  });
});
