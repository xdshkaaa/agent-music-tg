import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";
const TEST_CHAT = 888888;

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

describe("playlists routes", () => {
  test("create/list/rename/delete", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const create = await req(app, "/playlists", { method: "POST", body: JSON.stringify({ name: "Chill" }) });
    expect(create.status).toBe(200);
    const { playlist } = (await create.json()) as { playlist: { id: number } };

    const list = await req(app, "/playlists");
    expect(((await list.json()) as { playlists: unknown[] }).playlists).toHaveLength(1);

    const rename = await req(app, `/playlists/${playlist.id}`, { method: "PATCH", body: JSON.stringify({ name: "Focus" }) });
    expect(rename.status).toBe(200);

    const del = await req(app, `/playlists/${playlist.id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    expect((await (await req(app, "/playlists")).json() as { playlists: unknown[] }).playlists).toHaveLength(0);
  });

  test("enforces the free limit with a 403 + starsPrice", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    await req(app, "/playlists", { method: "POST", body: JSON.stringify({ name: "A" }) });
    await req(app, "/playlists", { method: "POST", body: JSON.stringify({ name: "B" }) });
    const res = await req(app, "/playlists", { method: "POST", body: JSON.stringify({ name: "C" }) });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; starsPrice: number };
    expect(body.error).toBe("limit");
    expect(body.starsPrice).toBeGreaterThan(0);
  });

  test("add/remove track is idempotent", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const create = await req(app, "/playlists", { method: "POST", body: JSON.stringify({ name: "Chill" }) });
    const { playlist } = (await create.json()) as { playlist: { id: number } };
    const track = { uri: "ytm:a", title: "One", artist: "A" };
    const add1 = await req(app, `/playlists/${playlist.id}/tracks`, { method: "POST", body: JSON.stringify(track) });
    expect((await add1.json()) as { duplicate: boolean }).toMatchObject({ duplicate: false });
    const add2 = await req(app, `/playlists/${playlist.id}/tracks`, { method: "POST", body: JSON.stringify(track) });
    expect((await add2.json()) as { duplicate: boolean }).toMatchObject({ duplicate: true });
  });
});

describe("POST /api/playlists/slots/invoice", () => {
  test("returns a stars invoice link", async () => {
    const db = freshDb();
    const calls: unknown[] = [];
    const app = createApiRoutes(db, {
      createStarsInvoiceLink: async (args) => {
        calls.push(args);
        return "https://t.me/$slots-link";
      },
    });
    const res = await req(app, "/playlists/slots/invoice", { method: "POST", body: JSON.stringify({ slots: 2 }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { payUrl: string };
    expect(body.payUrl).toBe("https://t.me/$slots-link");
    expect((calls[0] as { starsAmount: number }).starsAmount).toBe(10);
  });

  test("503s when Stars payments are unavailable", async () => {
    const db = freshDb();
    const app = createApiRoutes(db, {});
    const res = await req(app, "/playlists/slots/invoice", { method: "POST", body: JSON.stringify({ slots: 1 }) });
    expect(res.status).toBe(503);
  });
});
