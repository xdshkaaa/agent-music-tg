import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createHmac } from "node:crypto";

// env.ts throws without a bot token at import time; set one before the
// dynamic imports below pull it in.
process.env.TELEGRAM_BOT_TOKEN ??= "test-token";

const { env } = await import("../env");
const { openDb } = await import("../db");
const { createOffer, updateOffer } = await import("./offers-store");
const { insertPendingInvoice, getInvoice, listInvoicesForChat } = await import("./invoices-store");
const { fulfillInvoice } = await import("./fulfillment");
const { fulfillStarsPayment } = await import("./stars");
const { pollOnce } = await import("./poller");
const { getUser, upsertUser } = await import("../access/users-store");
const { hasAccess } = await import("../access/entitlements");
const { createApiRoutes } = await import("../api/routes");
import type { CryptoInvoice } from "./crypto-pay";

const CHAT = 991199;

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
  db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [CHAT]);
  return db;
}

function zeroCredits(db: ReturnType<typeof freshDb>, chatId: number) {
  db.query(`UPDATE users SET credits = 0 WHERE chat_id = ?`).run(chatId);
}

function apiRequest(
  app: ReturnType<typeof createApiRoutes>,
  path: string,
  init?: { method?: string; body?: unknown },
) {
  return app.request(path, {
    method: init?.method ?? "GET",
    headers: { "X-Telegram-Init-Data": buildInitData(CHAT), "content-type": "application/json" },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
}

// /me calls api.telegram.org for the avatar — stub fetch so tests stay offline.
const realFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("api.telegram.org")) {
      return Promise.resolve(Response.json({ ok: true, result: { total_count: 0, photos: [] } }));
    }
    return realFetch(input as never);
  }) as typeof fetch;
  env.paymentsEnabled = true;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("crypto purchase end-to-end (invoice → fulfillment → /api/me)", () => {
  test("credits offer: balance grows in /api/me and access opens", async () => {
    const db = freshDb();
    upsertUser(db, CHAT);
    zeroCredits(db, CHAT);
    expect(hasAccess(db, CHAT)).toBe(false);

    const offer = createOffer(db, {
      title: "10 генераций", amount: "5", asset: "USDT", starsAmount: 100, grantKind: "credits", grantAmount: 10,
    });
    insertPendingInvoice(db, {
      provider: "crypto", externalId: "1001", chatId: CHAT, offerId: offer.id, amount: "5", asset: "USDT",
    });

    // webhook path
    expect(fulfillInvoice(db, 1001).fulfilled).toBe(true);

    const app = createApiRoutes(db);
    const res = await apiRequest(app, "/me");
    expect(res.status).toBe(200);
    const me = (await res.json()) as { credits: number };
    expect(me.credits).toBe(10);
    expect(hasAccess(db, CHAT)).toBe(true);
  });

  test("subscription offer: /api/me shows expiry, stacks on remaining time", async () => {
    const db = freshDb();
    upsertUser(db, CHAT);
    zeroCredits(db, CHAT);

    const offer = createOffer(db, {
      title: "Месяц", amount: "9", asset: "USDT", starsAmount: 500, grantKind: "subscription", grantAmount: 30,
    });
    insertPendingInvoice(db, {
      provider: "crypto", externalId: "1002", chatId: CHAT, offerId: offer.id, amount: "9", asset: "USDT",
    });
    fulfillInvoice(db, 1002);

    const now = Math.floor(Date.now() / 1000);
    const first = getUser(db, CHAT)!.subscriptionUntil!;
    expect(first).toBeGreaterThan(now + 29 * 86400);

    // second purchase stacks on the remainder, not on `now`
    insertPendingInvoice(db, {
      provider: "crypto", externalId: "1003", chatId: CHAT, offerId: offer.id, amount: "9", asset: "USDT",
    });
    fulfillInvoice(db, 1003);
    expect(getUser(db, CHAT)!.subscriptionUntil!).toBe(first + 30 * 86400);

    const app = createApiRoutes(db);
    const me = (await (await apiRequest(app, "/me")).json()) as { subscriptionUntil: number | null };
    expect(me.subscriptionUntil).toBe(first + 30 * 86400);
    expect(hasAccess(db, CHAT)).toBe(true);
  });
});

describe("stars purchase grants subscription", () => {
  test("subscription offer via successful_payment", () => {
    const db = freshDb();
    upsertUser(db, CHAT);
    zeroCredits(db, CHAT);
    const offer = createOffer(db, {
      title: "Месяц", amount: "9", asset: "USDT", starsAmount: 500, grantKind: "subscription", grantAmount: 30,
    });

    const res = fulfillStarsPayment(db, { chargeId: "ch_sub", chatId: CHAT, offerId: offer.id, starsAmount: 500 });
    expect(res.fulfilled).toBe(true);

    const now = Math.floor(Date.now() / 1000);
    expect(getUser(db, CHAT)!.subscriptionUntil!).toBeGreaterThan(now + 29 * 86400);
    expect(hasAccess(db, CHAT)).toBe(true);
    // subscription grant does not touch credits
    expect(getUser(db, CHAT)!.credits).toBe(0);
  });
});

describe("poller fallback (missed webhook)", () => {
  test("paid remote invoice is fulfilled exactly once across repeated polls", async () => {
    const db = freshDb();
    upsertUser(db, CHAT);
    zeroCredits(db, CHAT);
    const offer = createOffer(db, {
      title: "10 генераций", amount: "5", asset: "USDT", starsAmount: 100, grantKind: "credits", grantAmount: 10,
    });
    insertPendingInvoice(db, {
      provider: "crypto", externalId: "2001", chatId: CHAT, offerId: offer.id, amount: "5", asset: "USDT",
    });
    insertPendingInvoice(db, {
      provider: "crypto", externalId: "2002", chatId: CHAT, offerId: offer.id, amount: "5", asset: "USDT",
    });

    const fetched: number[][] = [];
    const remote = async (ids: number[]): Promise<CryptoInvoice[]> => {
      fetched.push(ids);
      return [
        { invoice_id: 2001, status: "paid" } as CryptoInvoice,
        { invoice_id: 2002, status: "active" } as CryptoInvoice,
      ];
    };

    const notified: string[] = [];
    await pollOnce(db, (r) => { if (r.offerTitle) notified.push(r.offerTitle); }, remote);

    expect(fetched[0]).toEqual([2001, 2002]);
    expect(getUser(db, CHAT)!.credits).toBe(10);
    expect(getInvoice(db, "crypto", "2001")?.status).toBe("paid");
    expect(getInvoice(db, "crypto", "2002")?.status).toBe("pending");
    expect(notified).toEqual(["10 генераций"]);

    // second poll: 2001 no longer pending, 2002 still active → no double grant
    await pollOnce(db, (r) => { if (r.offerTitle) notified.push(r.offerTitle); }, remote);
    expect(getUser(db, CHAT)!.credits).toBe(10);
    expect(notified).toEqual(["10 генераций"]);
    // only the still-pending invoice is re-queried
    expect(fetched[1]).toEqual([2002]);
  });
});

describe("inactive offer cannot be purchased", () => {
  test("crypto: POST /api/invoices → 400, no invoice row created", async () => {
    const db = freshDb();
    const offer = createOffer(db, {
      title: "off", amount: "5", asset: "USDT", starsAmount: 100, grantKind: "credits", grantAmount: 10,
    });
    updateOffer(db, offer.id, { active: false });

    const app = createApiRoutes(db);
    const res = await apiRequest(app, "/invoices", { method: "POST", body: { offerId: offer.id, method: "crypto" } });
    expect(res.status).toBe(400);
    expect(listInvoicesForChat(db, CHAT)).toHaveLength(0);
  });

  test("stars: POST /api/invoices → 400 for inactive offer", async () => {
    const db = freshDb();
    const offer = createOffer(db, {
      title: "off", amount: "5", asset: "USDT", starsAmount: 100, grantKind: "credits", grantAmount: 10,
    });
    updateOffer(db, offer.id, { active: false });

    const app = createApiRoutes(db, { createStarsInvoiceLink: async () => "unused" });
    const res = await apiRequest(app, "/invoices", { method: "POST", body: { offerId: offer.id, method: "stars" } });
    expect(res.status).toBe(400);
    expect(listInvoicesForChat(db, CHAT)).toHaveLength(0);
  });
});
