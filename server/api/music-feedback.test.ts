import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";
const TEST_CHAT = 424242;

const { env } = await import("../env");
const { openDb } = await import("../db");
const { upsertUser } = await import("../access/users-store");
const { getMusicFeedback } = await import("../access/music-feedback-store");
const { createApiRoutes } = await import("./routes");

function buildInitData(chatId: number): string {
  const params = new URLSearchParams();
  params.set("auth_date", String(Math.floor(Date.now() / 1000)));
  params.set("user", JSON.stringify({ id: chatId, first_name: "Test" }));
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(env.telegramBotToken).digest();
  params.set("hash", createHmac("sha256", secretKey).update(dataCheckString).digest("hex"));
  return params.toString();
}

function freshDb() {
  const db = openDb(":memory:");
  db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [TEST_CHAT]);
  upsertUser(db, TEST_CHAT);
  return db;
}

function post(app: ReturnType<typeof createApiRoutes>, body: unknown) {
  return app.request("/music-feedback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Telegram-Init-Data": buildInitData(TEST_CHAT),
    },
    body: JSON.stringify(body),
  });
}

describe("music feedback API", () => {
  test("stores allowed events and aggregates repeats into one row", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const track = { uri: "ytm:video_1", title: "Song", artist: "Artist" };

    expect((await post(app, { event: "play_started", ...track })).status).toBe(200);
    expect((await post(app, { event: "play_started", ...track })).status).toBe(200);
    expect((await post(app, { event: "play_completed", ...track })).status).toBe(200);

    const row = getMusicFeedback(db, TEST_CHAT, track.uri)!;
    expect(row.playStartedCount).toBe(2);
    expect(row.playCompletedCount).toBe(1);
    expect(row.skippedCount).toBe(0);
    expect(db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM music_feedback").get()!.n).toBe(1);
  });

  test("rejects unknown events and invalid backend URIs", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    expect((await post(app, { event: "liked", uri: "ytm:a", title: "Song", artist: "Artist" })).status).toBe(400);
    expect((await post(app, { event: "skipped", uri: "https://example.com", title: "Song", artist: "Artist" })).status).toBe(400);
    expect(db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM music_feedback").get()!.n).toBe(0);
  });

  test("requires Telegram authentication", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const response = await app.request("/music-feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "skipped", uri: "ytm:a", title: "Song", artist: "Artist" }),
    });
    expect(response.status).toBe(401);
  });
});
