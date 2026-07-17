import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createHash, createHmac } from "node:crypto";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// env.ts throws without a bot token at import time; set one before the
// dynamic imports below pull it in.
process.env.TELEGRAM_BOT_TOKEN ??= "test-token";

const { env } = await import("../env");
const { openDb } = await import("../db");
const { createOffer, updateOffer, listActiveOffers, InvalidStarsAmountError } = await import("./offers-store");
const { insertPendingInvoice, getInvoice, markPaid, listInvoicesForChat } = await import("./invoices-store");
const { fulfillInvoice } = await import("./fulfillment");
const { fulfillStarsPayment, parseStarsPayload } = await import("./stars");
const { verifyWebhookSignature } = await import("./webhook");
const { getUser, upsertUser, addCredits, extendSubscription, SIGNUP_BONUS_CREDITS, claimTrial, TRIAL_CREDITS } =
  await import("../access/users-store");
const { hasAccess, consumeAccess } = await import("../access/entitlements");

const CHAT = 111;
const BONUS = SIGNUP_BONUS_CREDITS;

function freshDb() {
  return openDb(":memory:");
}

function zeroCredits(db: ReturnType<typeof freshDb>, chatId: number) {
  db.query(`UPDATE users SET credits = 0 WHERE chat_id = ?`).run(chatId);
}

describe("idempotent fulfillment (crypto)", () => {
  test("credits granted exactly once across webhook + poll", () => {
    const db = freshDb();
    const offer = createOffer(db, { title: "10 gens", amount: "5", asset: "USDT", starsAmount: 100, grantKind: "credits", grantAmount: 10 });
    insertPendingInvoice(db, { provider: "crypto", externalId: "42", chatId: CHAT, offerId: offer.id, amount: "5", asset: "USDT" });

    const first = fulfillInvoice(db, 42); // webhook path
    const second = fulfillInvoice(db, 42); // poller path

    expect(first.fulfilled).toBe(true);
    expect(second.fulfilled).toBe(false);
    expect(getUser(db, CHAT)?.credits).toBe(BONUS + 10);
    expect(getInvoice(db, "crypto", "42")?.status).toBe("paid");
  });

  test("subscription extended exactly once", () => {
    const db = freshDb();
    const offer = createOffer(db, { title: "month", amount: "9", asset: "TON", starsAmount: 100, grantKind: "subscription", grantAmount: 30 });
    insertPendingInvoice(db, { provider: "crypto", externalId: "7", chatId: CHAT, offerId: offer.id, amount: "9", asset: "TON" });

    fulfillInvoice(db, 7);
    const afterFirst = getUser(db, CHAT)?.subscriptionUntil;
    fulfillInvoice(db, 7);
    const afterSecond = getUser(db, CHAT)?.subscriptionUntil;

    const now = Math.floor(Date.now() / 1000);
    expect(afterFirst).toBeGreaterThan(now + 29 * 86400);
    expect(afterSecond).toBe(afterFirst!);
  });

  test("unknown invoice fulfills nothing", () => {
    const db = freshDb();
    expect(fulfillInvoice(db, 999).fulfilled).toBe(false);
  });

  test("markPaid flips pending row only once", () => {
    const db = freshDb();
    insertPendingInvoice(db, { provider: "crypto", externalId: "1", chatId: CHAT, offerId: 1, amount: "1", asset: "USDT" });
    expect(markPaid(db, "crypto", "1")).toBe(true);
    expect(markPaid(db, "crypto", "1")).toBe(false);
  });
});

describe("stars fulfillment", () => {
  test("duplicate successful_payment grants exactly once", () => {
    const db = freshDb();
    const offer = createOffer(db, {
      title: "10 gens", amount: "5", asset: "USDT", starsAmount: 100, grantKind: "credits", grantAmount: 10,
    });
    const input = { chargeId: "ch_abc", chatId: CHAT, offerId: offer.id, starsAmount: 100 };

    const first = fulfillStarsPayment(db, input);
    const second = fulfillStarsPayment(db, input);

    expect(first.fulfilled).toBe(true);
    expect(first.offerTitle).toBe("10 gens");
    expect(second.fulfilled).toBe(false);
    expect(getUser(db, CHAT)?.credits).toBe(BONUS + 10);

    const inv = getInvoice(db, "stars", "ch_abc");
    expect(inv?.status).toBe("paid");
    expect(inv?.asset).toBe("XTR");
    expect(inv?.amount).toBe("100");
  });

  test("stars and crypto ids never collide", () => {
    const db = freshDb();
    const offer = createOffer(db, { title: "p", amount: "1", asset: "USDT", starsAmount: 50, grantKind: "credits", grantAmount: 1 });
    insertPendingInvoice(db, { provider: "crypto", externalId: "500", chatId: CHAT, offerId: offer.id, amount: "1", asset: "USDT" });
    const res = fulfillStarsPayment(db, { chargeId: "500", chatId: CHAT, offerId: offer.id, starsAmount: 50 });
    expect(res.fulfilled).toBe(true);
    expect(listInvoicesForChat(db, CHAT)).toHaveLength(2);
  });

  test("stars payment for a vanished offer records but grants nothing", () => {
    const db = freshDb();
    const res = fulfillStarsPayment(db, { chargeId: "ch_x", chatId: CHAT, offerId: 999, starsAmount: 10 });
    expect(res.fulfilled).toBe(true);
    expect(res.offerTitle).toBeUndefined();
    // No grant path ran, so no user row was created either.
    expect(getUser(db, CHAT)?.credits ?? 0).toBe(0);
  });

  test("payload round-trip", () => {
    expect(parseStarsPayload(JSON.stringify({ chatId: 1, offerId: 2 }))).toEqual({ chatId: 1, offerId: 2 });
    expect(parseStarsPayload("not json")).toBeNull();
    expect(parseStarsPayload(JSON.stringify({ chatId: "1" }))).toBeNull();
  });
});

describe("offer stars price validation", () => {
  test("createOffer rejects non-positive or fractional stars", () => {
    const db = freshDb();
    const base = { title: "p", amount: "1", asset: "USDT", grantKind: "credits" as const, grantAmount: 1 };
    expect(() => createOffer(db, { ...base, starsAmount: 0 })).toThrow(InvalidStarsAmountError);
    expect(() => createOffer(db, { ...base, starsAmount: -5 })).toThrow(InvalidStarsAmountError);
    expect(() => createOffer(db, { ...base, starsAmount: 1.5 })).toThrow(InvalidStarsAmountError);
  });

  test("updateOffer sets stars price and preserves on partial update", () => {
    const db = freshDb();
    const offer = createOffer(db, { title: "p", amount: "1", asset: "USDT", starsAmount: 50, grantKind: "credits", grantAmount: 1 });
    expect(offer.starsAmount).toBe(50);
    expect(updateOffer(db, offer.id, { starsAmount: 75 })?.starsAmount).toBe(75);
    // untouched when omitted
    expect(updateOffer(db, offer.id, { title: "q" })?.starsAmount).toBe(75);
  });

  test("createOffer without starsAmount throws", () => {
    const db = freshDb();
    const base = { title: "p", amount: "1", asset: "USDT", grantKind: "credits" as const, grantAmount: 1 };
    // @ts-expect-error starsAmount is required
    expect(() => createOffer(db, base)).toThrow(InvalidStarsAmountError);
  });

  test("updateOffer with explicit null starsAmount clears the field", () => {
    const db = freshDb();
    const offer = createOffer(db, { title: "p", amount: "1", asset: "USDT", starsAmount: 50, grantKind: "credits", grantAmount: 1 });
    const updated = updateOffer(db, offer.id, { starsAmount: null as unknown as number });
    expect(updated?.starsAmount).toBeNull();
  });

  test("updateOffer with null on a grandfathered (null) offer keeps null", () => {
    const db = freshDb();
    const offer = createOffer(db, { title: "p", amount: "1", asset: "USDT", starsAmount: 50, grantKind: "credits", grantAmount: 1 });
    db.query(`UPDATE offers SET stars_amount = NULL WHERE id = ?`).run(offer.id);
    const updated = updateOffer(db, offer.id, { starsAmount: null as unknown as number });
    expect(updated?.starsAmount).toBeNull();
  });

  test("grandfathered offer with NULL starsAmount still listed and crypto-purchasable", () => {
    const db = freshDb();
    const row = db.query<{ id: number }, [string, string, string, string, number]>(
      `INSERT INTO offers (title, amount, asset, grant_kind, grant_amount) VALUES (?, ?, ?, ?, ?) RETURNING id`,
    ).get("legacy", "5", "USDT", "credits", 10);
    const legacyId = row!.id;

    const offers = listActiveOffers(db);
    expect(offers).toHaveLength(1);
    expect(offers[0]!.id).toBe(legacyId);
    expect(offers[0]!.starsAmount).toBeNull();

    // crypto purchase still works
    insertPendingInvoice(db, { provider: "crypto", externalId: "777", chatId: CHAT, offerId: legacyId, amount: "5", asset: "USDT" });
    const res = fulfillInvoice(db, 777);
    expect(res.fulfilled).toBe(true);
    expect(getUser(db, CHAT)?.credits).toBe(BONUS + 10);
  });
});

describe("signup bonus", () => {
  test("new user via upsertUser (bot /start or Mini App auth) gets the bonus once", () => {
    const db = freshDb();
    upsertUser(db, CHAT, "alice");
    expect(getUser(db, CHAT)?.credits).toBe(BONUS);
    upsertUser(db, CHAT, "alice"); // repeated contact
    upsertUser(db, CHAT);
    expect(getUser(db, CHAT)?.credits).toBe(BONUS);
  });

  test("returning user with zero balance gets nothing extra", () => {
    const db = freshDb();
    upsertUser(db, CHAT);
    zeroCredits(db, CHAT);
    upsertUser(db, CHAT);
    expect(getUser(db, CHAT)?.credits).toBe(0);
  });

  test("first contact via purchase path: bonus plus purchased grant", () => {
    const db = freshDb();
    addCredits(db, CHAT, 5); // ensureUser path creates the row
    expect(getUser(db, CHAT)?.credits).toBe(BONUS + 5);
  });
});

describe("invoices migration", () => {
  test("legacy crypto rows survive as provider=crypto with history intact", () => {
    const dir = mkdtempSync(join(tmpdir(), "inv-migration-"));
    const path = join(dir, "app.sqlite");
    try {
      const legacy = new Database(path);
      legacy.run(`
        CREATE TABLE invoices (
          invoice_id INTEGER PRIMARY KEY,
          chat_id INTEGER NOT NULL,
          offer_id INTEGER NOT NULL,
          amount TEXT NOT NULL,
          asset TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          paid_at INTEGER
        );
      `);
      legacy.run(`INSERT INTO invoices (invoice_id, chat_id, offer_id, amount, asset, status, paid_at) VALUES (42, ${CHAT}, 1, '5', 'USDT', 'paid', 1700000000)`);
      legacy.run(`INSERT INTO invoices (invoice_id, chat_id, offer_id, amount, asset, status) VALUES (43, ${CHAT}, 2, '9', 'TON', 'pending')`);
      legacy.close();

      const db = openDb(path);
      const all = listInvoicesForChat(db, CHAT);
      expect(all).toHaveLength(2);
      const paid = getInvoice(db, "crypto", "42");
      expect(paid?.status).toBe("paid");
      expect(paid?.paidAt).toBe(1700000000);
      expect(getInvoice(db, "crypto", "43")?.status).toBe("pending");
      // still idempotent post-migration
      expect(markPaid(db, "crypto", "43")).toBe(true);
      expect(markPaid(db, "crypto", "43")).toBe(false);
      // migration does not run twice
      const again = openDb(path);
      expect(listInvoicesForChat(again, CHAT)).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("entitlements", () => {
  const savedPaymentsEnabled = env.paymentsEnabled;

  beforeEach(() => {
    env.paymentsEnabled = true;
  });
  afterEach(() => {
    env.paymentsEnabled = savedPaymentsEnabled;
  });

  test("no user row → no access", () => {
    const db = freshDb();
    expect(hasAccess(db, CHAT)).toBe(false);
  });

  test("credits grant access; consumption decrements by one", () => {
    const db = freshDb();
    upsertUser(db, CHAT);
    zeroCredits(db, CHAT);
    addCredits(db, CHAT, 2);
    expect(hasAccess(db, CHAT)).toBe(true);
    consumeAccess(db, CHAT);
    expect(getUser(db, CHAT)?.credits).toBe(1);
    consumeAccess(db, CHAT);
    expect(getUser(db, CHAT)?.credits).toBe(0);
    expect(hasAccess(db, CHAT)).toBe(false);
  });

  test("active subscription grants access and is not charged", () => {
    const db = freshDb();
    extendSubscription(db, CHAT, 30);
    zeroCredits(db, CHAT);
    addCredits(db, CHAT, 3);
    expect(hasAccess(db, CHAT)).toBe(true);
    consumeAccess(db, CHAT);
    expect(getUser(db, CHAT)?.credits).toBe(3);
  });

  test("expired subscription without credits → no access", () => {
    const db = freshDb();
    upsertUser(db, CHAT);
    zeroCredits(db, CHAT);
    const past = Math.floor(Date.now() / 1000) - 60;
    db.query(`UPDATE users SET subscription_until = ? WHERE chat_id = ?`).run(past, CHAT);
    expect(hasAccess(db, CHAT)).toBe(false);
  });

  test("paymentsEnabled=false bypasses paywall and consumption", () => {
    const db = freshDb();
    env.paymentsEnabled = false;
    expect(hasAccess(db, CHAT)).toBe(true);
    consumeAccess(db, CHAT);
    expect(getUser(db, CHAT)?.credits ?? 0).toBe(0);
  });

  test("admin bypasses paywall even without credits or subscription", () => {
    const db = freshDb();
    db.query(`INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 1)`).run(CHAT);
    expect(hasAccess(db, CHAT)).toBe(true);
    consumeAccess(db, CHAT);
    expect(getUser(db, CHAT)?.credits ?? 0).toBe(0);
  });

  test("non-admin without credits has no access", () => {
    const db = freshDb();
    db.query(`INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)`).run(CHAT);
    upsertUser(db, CHAT);
    zeroCredits(db, CHAT);
    expect(hasAccess(db, CHAT)).toBe(false);
  });
});

describe("free trial", () => {
  const savedPaymentsEnabled = env.paymentsEnabled;

  beforeEach(() => {
    env.paymentsEnabled = true;
  });
  afterEach(() => {
    env.paymentsEnabled = savedPaymentsEnabled;
  });

  function expireTrial(db: ReturnType<typeof freshDb>, chatId: number) {
    const past = Math.floor(Date.now() / 1000) - 60;
    db.query(`UPDATE users SET trial_until = ? WHERE chat_id = ?`).run(past, chatId);
  }

  test("claim grants once; second claim rejected", () => {
    const db = freshDb();
    expect(claimTrial(db, CHAT)).toBe(true);
    const user = getUser(db, CHAT);
    expect(user?.trialCredits).toBe(TRIAL_CREDITS);
    expect(user?.trialUntil).toBeGreaterThan(Math.floor(Date.now() / 1000) + 2 * 86400);
    expect(user?.trialClaimedAt).not.toBeNull();

    expect(claimTrial(db, CHAT)).toBe(false);
    expect(getUser(db, CHAT)?.trialCredits).toBe(TRIAL_CREDITS);
  });

  test("re-claim after expiry or exhaustion stays rejected", () => {
    const db = freshDb();
    claimTrial(db, CHAT);
    db.query(`UPDATE users SET trial_credits = 0 WHERE chat_id = ?`).run(CHAT);
    expireTrial(db, CHAT);
    expect(claimTrial(db, CHAT)).toBe(false);
  });

  test("active trial grants access without paid credits or subscription", () => {
    const db = freshDb();
    upsertUser(db, CHAT);
    zeroCredits(db, CHAT);
    expect(hasAccess(db, CHAT)).toBe(false);
    claimTrial(db, CHAT);
    expect(hasAccess(db, CHAT)).toBe(true);
  });

  test("no access after trial expiry", () => {
    const db = freshDb();
    upsertUser(db, CHAT);
    zeroCredits(db, CHAT);
    claimTrial(db, CHAT);
    expireTrial(db, CHAT);
    expect(hasAccess(db, CHAT)).toBe(false);
  });

  test("no access after trial exhaustion", () => {
    const db = freshDb();
    upsertUser(db, CHAT);
    zeroCredits(db, CHAT);
    claimTrial(db, CHAT);
    for (let i = 0; i < TRIAL_CREDITS; i++) consumeAccess(db, CHAT);
    expect(getUser(db, CHAT)?.trialCredits).toBe(0);
    expect(hasAccess(db, CHAT)).toBe(false);
  });

  test("trial credits drain before paid credits", () => {
    const db = freshDb();
    upsertUser(db, CHAT);
    zeroCredits(db, CHAT);
    addCredits(db, CHAT, 5);
    claimTrial(db, CHAT);
    consumeAccess(db, CHAT);
    const user = getUser(db, CHAT);
    expect(user?.trialCredits).toBe(TRIAL_CREDITS - 1);
    expect(user?.credits).toBe(5);
  });

  test("expired trial never consumed; falls back to paid credits", () => {
    const db = freshDb();
    upsertUser(db, CHAT);
    zeroCredits(db, CHAT);
    addCredits(db, CHAT, 5);
    claimTrial(db, CHAT);
    expireTrial(db, CHAT);
    consumeAccess(db, CHAT);
    const user = getUser(db, CHAT);
    expect(user?.trialCredits).toBe(TRIAL_CREDITS);
    expect(user?.credits).toBe(4);
  });

  test("subscriber is not charged trial or paid credits", () => {
    const db = freshDb();
    extendSubscription(db, CHAT, 30);
    zeroCredits(db, CHAT);
    claimTrial(db, CHAT);
    consumeAccess(db, CHAT);
    const user = getUser(db, CHAT);
    expect(user?.trialCredits).toBe(TRIAL_CREDITS);
    expect(user?.credits).toBe(0);
  });
});

describe("webhook signature", () => {
  const savedToken = env.cryptobotToken;

  beforeEach(() => {
    env.cryptobotToken = "12345:AAtestapptoken";
  });
  afterEach(() => {
    env.cryptobotToken = savedToken;
  });

  function sign(body: string, token: string): string {
    const secret = createHash("sha256").update(token).digest();
    return createHmac("sha256", secret).update(body).digest("hex");
  }

  const body = JSON.stringify({ update_type: "invoice_paid", payload: { invoice_id: 42, status: "paid" } });

  test("valid signature accepted", () => {
    expect(verifyWebhookSignature(body, sign(body, env.cryptobotToken))).toBe(true);
  });

  test("signature from wrong token rejected", () => {
    expect(verifyWebhookSignature(body, sign(body, "other-token"))).toBe(false);
  });

  test("tampered body rejected", () => {
    const sig = sign(body, env.cryptobotToken);
    expect(verifyWebhookSignature(body.replace("42", "43"), sig)).toBe(false);
  });

  test("missing signature rejected", () => {
    expect(verifyWebhookSignature(body, undefined)).toBe(false);
    expect(verifyWebhookSignature(body, "")).toBe(false);
  });

  test("malformed hex of wrong length rejected", () => {
    expect(verifyWebhookSignature(body, "deadbeef")).toBe(false);
  });
});
