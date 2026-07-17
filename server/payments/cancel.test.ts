import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";

const { env } = await import("../env");
const { openDb } = await import("../db");
const { createOffer } = await import("./offers-store");
const { insertPendingInvoice, getInvoice } = await import("./invoices-store");
const { cancelInvoiceAndRefund } = await import("./cancel");
const { fulfillPendingInvoice } = await import("./fulfillment");
const { getUser, upsertUser, addCredits, reserveCredits, refundCredits, SIGNUP_BONUS_CREDITS } = await import("../access/users-store");

const CHAT = 111;
const BONUS = SIGNUP_BONUS_CREDITS;

function freshDb() {
  return openDb(":memory:");
}

/** Ensures a user exists and sets an exact credit balance (ignoring the bonus). */
function setCredits(db: ReturnType<typeof freshDb>, chatId: number, credits: number) {
  upsertUser(db, chatId);
  db.query(`UPDATE users SET credits = ? WHERE chat_id = ?`).run(credits, chatId);
}

describe("credit hold + rollback on cancellation", () => {
  test("creating a credits invoice reserves the grant, cancel rolls it back", () => {
    const db = freshDb();
    setCredits(db, CHAT, 20);
    const offer = createOffer(db, { title: "10 gens", amount: "5", asset: "USDT", starsAmount: 100, rubAmount: 300, grantKind: "credits", grantAmount: 10 });

    insertPendingInvoice(db, { provider: "platega", externalId: "tx-1", chatId: CHAT, offerId: offer.id, amount: "300", asset: "RUB", reservedCredits: reserveCredits(db, CHAT, offer.grantAmount) });

    expect(getUser(db, CHAT)?.credits).toBe(10); // 20 - 10 held
    const inv = getInvoice(db, "platega", "tx-1")!;
    expect(inv.reservedCredits).toBe(10);

    const result = cancelInvoiceAndRefund(db, "platega", "tx-1");
    expect(result.canceled).toBe(true);
    expect(result.refundedCredits).toBe(10);
    expect(getUser(db, CHAT)?.credits).toBe(20); // rolled back to start
    expect(getInvoice(db, "platega", "tx-1")?.status).toBe("canceled");
  });

  test("cancel is idempotent — refund fires only once", () => {
    const db = freshDb();
    setCredits(db, CHAT, 20);
    const offer = createOffer(db, { title: "10 gens", amount: "5", asset: "USDT", starsAmount: 100, rubAmount: 300, grantKind: "credits", grantAmount: 10 });

    insertPendingInvoice(db, { provider: "platega", externalId: "tx-2", chatId: CHAT, offerId: offer.id, amount: "300", asset: "RUB", reservedCredits: reserveCredits(db, CHAT, offer.grantAmount) });

    expect(cancelInvoiceAndRefund(db, "platega", "tx-2").canceled).toBe(true);
    expect(cancelInvoiceAndRefund(db, "platega", "tx-2").canceled).toBe(false);
    expect(getUser(db, CHAT)?.credits).toBe(20);
  });

  test("paid invoice releases the hold and grants the pack (no double count)", () => {
    const db = freshDb();
    setCredits(db, CHAT, 20);
    const offer = createOffer(db, { title: "10 gens", amount: "5", asset: "USDT", starsAmount: 100, rubAmount: 300, grantKind: "credits", grantAmount: 10 });

    insertPendingInvoice(db, { provider: "platega", externalId: "tx-3", chatId: CHAT, offerId: offer.id, amount: "300", asset: "RUB", reservedCredits: reserveCredits(db, CHAT, offer.grantAmount) });

    const result = fulfillPendingInvoice(db, "platega", "tx-3");
    expect(result.fulfilled).toBe(true);
    // started 20, held 10 -> 10, release 10 -> 20, grant 10 -> 30
    expect(getUser(db, CHAT)?.credits).toBe(30);
  });

  test("reservation never goes negative when balance is short", () => {
    const db = freshDb();
    setCredits(db, CHAT, 3); // less than the 10-pack
    const offer = createOffer(db, { title: "10 gens", amount: "5", asset: "USDT", starsAmount: 100, rubAmount: 300, grantKind: "credits", grantAmount: 10 });

    const reserved = reserveCredits(db, CHAT, offer.grantAmount);
    expect(reserved).toBe(3);
    expect(getUser(db, CHAT)?.credits).toBe(0);

    insertPendingInvoice(db, { provider: "platega", externalId: "tx-4", chatId: CHAT, offerId: offer.id, amount: "300", asset: "RUB", reservedCredits: reserved });
    const result = cancelInvoiceAndRefund(db, "platega", "tx-4");
    expect(result.refundedCredits).toBe(3);
    expect(getUser(db, CHAT)?.credits).toBe(3); // only what was reserved
  });
});

describe("reserveCredits / refundCredits primitives", () => {
  test("reserve caps at balance; refund adds back", () => {
    const db = freshDb();
    setCredits(db, CHAT, 5);
    expect(reserveCredits(db, CHAT, 100)).toBe(5);
    refundCredits(db, CHAT, 5);
    expect(getUser(db, CHAT)?.credits).toBe(5);
  });
});

