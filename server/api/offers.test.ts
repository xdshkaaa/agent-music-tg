import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";
const ADMIN_CHAT = 123456;

const { env } = await import("../env");
const { openDb } = await import("../db");
const { createOffer } = await import("../payments/offers-store");
const { createApiRoutes } = await import("./routes");

function buildInitData(chatId: number): string {
  const params = new URLSearchParams();
  params.set("auth_date", String(Math.floor(Date.now() / 1000)));
  params.set("user", JSON.stringify({ id: chatId, first_name: "Admin" }));
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
  db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 1)", [ADMIN_CHAT]);
  return db;
}

describe("PATCH /admin/offers/:id", () => {
  test("updates asset without starsAmount — preserves existing starsAmount", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const offer = createOffer(db, { title: "10 gens", amount: "5", asset: "USDT", starsAmount: 100, grantKind: "credits", grantAmount: 10 });
    const res = await app.request(`/admin/offers/${offer.id}`, {
      method: "PATCH",
      headers: { "X-Telegram-Init-Data": buildInitData(ADMIN_CHAT), "content-type": "application/json" },
      body: JSON.stringify({ asset: "TON" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    const updated = body.offer as Record<string, unknown>;
    expect(updated.asset).toBe("TON");
    expect(updated.starsAmount).toBe(100);
  });

  test("accepts starsAmount: null for legacy offers", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const row = db.query<{ id: number }, [string, string, string, string, number]>(
      `INSERT INTO offers (title, amount, asset, grant_kind, grant_amount) VALUES (?, ?, ?, ?, ?) RETURNING id`,
    ).get("legacy", "5", "USDT", "credits", 10);
    const legacyId = row!.id;
    const res = await app.request(`/admin/offers/${legacyId}`, {
      method: "PATCH",
      headers: { "X-Telegram-Init-Data": buildInitData(ADMIN_CHAT), "content-type": "application/json" },
      body: JSON.stringify({ starsAmount: null }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.offer).toBeDefined();
  });

  test("accepts starsAmount update with valid positive integer", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const offer = createOffer(db, { title: "10 gens", amount: "5", asset: "USDT", starsAmount: 100, grantKind: "credits", grantAmount: 10 });
    const res = await app.request(`/admin/offers/${offer.id}`, {
      method: "PATCH",
      headers: { "X-Telegram-Init-Data": buildInitData(ADMIN_CHAT), "content-type": "application/json" },
      body: JSON.stringify({ starsAmount: 50 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect((body.offer as Record<string, unknown>).starsAmount).toBe(50);
  });

  test("rejects invalid starsAmount (-5)", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const offer = createOffer(db, { title: "10 gens", amount: "5", asset: "USDT", starsAmount: 100, grantKind: "credits", grantAmount: 10 });
    const res = await app.request(`/admin/offers/${offer.id}`, {
      method: "PATCH",
      headers: { "X-Telegram-Init-Data": buildInitData(ADMIN_CHAT), "content-type": "application/json" },
      body: JSON.stringify({ starsAmount: -5 }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects invalid starsAmount (non-numeric string)", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const offer = createOffer(db, { title: "10 gens", amount: "5", asset: "USDT", starsAmount: 100, grantKind: "credits", grantAmount: 10 });
    const res = await app.request(`/admin/offers/${offer.id}`, {
      method: "PATCH",
      headers: { "X-Telegram-Init-Data": buildInitData(ADMIN_CHAT), "content-type": "application/json" },
      body: JSON.stringify({ starsAmount: "abc" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /admin/offers (create)", () => {
  test("rejects starsAmount: 0 for new offers", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const res = await app.request("/admin/offers", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": buildInitData(ADMIN_CHAT), "content-type": "application/json" },
      body: JSON.stringify({ title: "test", amount: "5", asset: "USDT", starsAmount: 0, grantKind: "credits", grantAmount: 10 }),
    });
    expect(res.status).toBe(400);
  });
});

describe("admin offers rubAmount round-trip", () => {
  test("create with rubAmount, then patch to a new value, then clear it", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const createRes = await app.request("/admin/offers", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": buildInitData(ADMIN_CHAT), "content-type": "application/json" },
      body: JSON.stringify({ title: "rub pack", amount: "5", asset: "USDT", starsAmount: 100, rubAmount: 300, grantKind: "credits", grantAmount: 10 }),
    });
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as { offer: { id: number; rubAmount: number | null } };
    expect(created.offer.rubAmount).toBe(300);

    const patchRes = await app.request(`/admin/offers/${created.offer.id}`, {
      method: "PATCH",
      headers: { "X-Telegram-Init-Data": buildInitData(ADMIN_CHAT), "content-type": "application/json" },
      body: JSON.stringify({ rubAmount: 500 }),
    });
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as { offer: { rubAmount: number | null } };
    expect(patched.offer.rubAmount).toBe(500);

    const clearRes = await app.request(`/admin/offers/${created.offer.id}`, {
      method: "PATCH",
      headers: { "X-Telegram-Init-Data": buildInitData(ADMIN_CHAT), "content-type": "application/json" },
      body: JSON.stringify({ rubAmount: null }),
    });
    expect(clearRes.status).toBe(200);
    const cleared = (await clearRes.json()) as { offer: { rubAmount: number | null } };
    expect(cleared.offer.rubAmount).toBeNull();
  });

  test("rejects invalid rubAmount (-5)", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const res = await app.request("/admin/offers", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": buildInitData(ADMIN_CHAT), "content-type": "application/json" },
      body: JSON.stringify({ title: "test", amount: "5", asset: "USDT", starsAmount: 100, rubAmount: -5, grantKind: "credits", grantAmount: 10 }),
    });
    expect(res.status).toBe(400);
  });
});
