import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";
const TEST_CHAT = 777777;

const { env } = await import("../env");
const { openDb } = await import("../db");
const { createOffer } = await import("../payments/offers-store");
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
  return db;
}

function post(app: ReturnType<typeof createApiRoutes>, body: unknown) {
  return app.request("/invoices", {
    method: "POST",
    headers: { "X-Telegram-Init-Data": buildInitData(TEST_CHAT), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/invoices (stars)", () => {
  const savedPaymentsEnabled = env.paymentsEnabled;

  test("returns a stars invoice link for a dual-price offer", async () => {
    env.paymentsEnabled = true;
    try {
      const db = freshDb();
      const offer = createOffer(db, {
        title: "10 gens", amount: "5", asset: "USDT", starsAmount: 100, grantKind: "credits", grantAmount: 10,
      });
      const calls: unknown[] = [];
      const app = createApiRoutes(db, {
        createStarsInvoiceLink: async (args) => {
          calls.push(args);
          return "https://t.me/$stars-link";
        },
      });
      const res = await post(app, { offerId: offer.id, method: "stars" });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.payUrl).toBe("https://t.me/$stars-link");
      expect(body.method).toBe("stars");
      expect(calls).toHaveLength(1);
      expect((calls[0] as { starsAmount: number }).starsAmount).toBe(100);
      const payload = JSON.parse((calls[0] as { payload: string }).payload) as Record<string, unknown>;
      expect(payload.chatId).toBe(TEST_CHAT);
      expect(payload.offerId).toBe(offer.id);
    } finally {
      env.paymentsEnabled = savedPaymentsEnabled;
    }
  });

  test("400 when stars requested for a grandfathered crypto-only offer", async () => {
    env.paymentsEnabled = true;
    try {
      const db = freshDb();
      const row = db.query<{ id: number }, [string, string, string, string, number]>(
        `INSERT INTO offers (title, amount, asset, grant_kind, grant_amount) VALUES (?, ?, ?, ?, ?) RETURNING id`,
      ).get("legacy", "5", "USDT", "credits", 10);
      const legacyId = row!.id;
      const app = createApiRoutes(db, { createStarsInvoiceLink: async () => "unused" });
      const res = await post(app, { offerId: legacyId, method: "stars" });
      expect(res.status).toBe(400);
    } finally {
      env.paymentsEnabled = savedPaymentsEnabled;
    }
  });

  test("400 for unknown method", async () => {
    env.paymentsEnabled = true;
    try {
      const db = freshDb();
      const offer = createOffer(db, { title: "p", amount: "5", asset: "USDT", starsAmount: 100, grantKind: "credits", grantAmount: 10 });
      const app = createApiRoutes(db, {});
      const res = await post(app, { offerId: offer.id, method: "paypal" });
      expect(res.status).toBe(400);
    } finally {
      env.paymentsEnabled = savedPaymentsEnabled;
    }
  });
});
