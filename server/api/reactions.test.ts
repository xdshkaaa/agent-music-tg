import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";
const TEST_CHAT = 444444;

const { env } = await import("../env");
const { openDb } = await import("../db");
const { upsertUser } = await import("../access/users-store");
const { createApiRoutes } = await import("./routes");

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

function freshDb() {
  const db = openDb(":memory:");
  db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [TEST_CHAT]);
  upsertUser(db, TEST_CHAT);
  return db;
}

function req(app: ReturnType<typeof createApiRoutes>, path: string, init: RequestInit = {}) {
  return app.request(path, {
    ...init,
    headers: { ...init.headers, "X-Telegram-Init-Data": buildInitData(TEST_CHAT), "content-type": "application/json" },
  });
}

describe("reactions routes", () => {
  test("dislike then status reflects it, and clears the favorite", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const track = { uri: "ytm:a", title: "One", artist: "A" };
    await req(app, "/my-music", { method: "POST", body: JSON.stringify(track) });

    const dislike = await req(app, "/reactions/dislike", { method: "POST", body: JSON.stringify(track) });
    expect(dislike.status).toBe(200);

    const status = await req(app, `/reactions/status?uri=${encodeURIComponent(track.uri)}`);
    const body = (await status.json()) as { liked: boolean; disliked: boolean };
    expect(body).toEqual({ liked: false, disliked: true });
  });

  test("undislike removes the reaction", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const track = { uri: "ytm:a", title: "One", artist: "A" };
    await req(app, "/reactions/dislike", { method: "POST", body: JSON.stringify(track) });
    const del = await req(app, `/reactions/dislike/${encodeURIComponent(track.uri)}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    const status = await req(app, `/reactions/status?uri=${encodeURIComponent(track.uri)}`);
    expect((await status.json()) as { disliked: boolean }).toMatchObject({ disliked: false });
  });
});
