import { describe, expect, test } from "bun:test";

// env.ts throws without a bot token at import time; set one before the
// dynamic imports below pull it in.
process.env.TELEGRAM_BOT_TOKEN ??= "test-token";

const { openDb } = await import("../db");
const { createOffer, assertValidRubAmount, InvalidRubAmountError } = await import("./offers-store");
const { insertPendingInvoice, getInvoice, markCanceled, listPendingInvoices } = await import("./invoices-store");
const { fulfillPendingInvoice } = await import("./fulfillment");
const { purchaseOfferRub, OfferUnavailableError, RubPriceMissingError } = await import("./purchase");
const { pollPlategaOnce } = await import("./poller");
const { getUser, SIGNUP_BONUS_CREDITS } = await import("../access/users-store");

const CHAT = 222;
const BONUS = SIGNUP_BONUS_CREDITS;

function freshDb() {
  return openDb(":memory:");
}

describe("rubAmount validation", () => {
  test("rejects zero, negative, fractional", () => {
    expect(() => assertValidRubAmount(0)).toThrow(InvalidRubAmountError);
    expect(() => assertValidRubAmount(-5)).toThrow(InvalidRubAmountError);
    expect(() => assertValidRubAmount(1.5)).toThrow(InvalidRubAmountError);
  });

  test("accepts positive integers", () => {
    expect(() => assertValidRubAmount(100)).not.toThrow();
  });

  test("createOffer/updateOffer: rubAmount null clears, undefined keeps", () => {
    const db = freshDb();
    const offer = createOffer(db, {
      title: "pack",
      amount: "5",
      asset: "USDT",
      starsAmount: 100,
      rubAmount: 300,
      grantKind: "credits",
      grantAmount: 10,
    });
    expect(offer.rubAmount).toBe(300);
  });
});

describe("idempotent fulfillment (platega)", () => {
  test("credits granted exactly once across webhook + poll", () => {
    const db = freshDb();
    const offer = createOffer(db, { title: "10 gens", amount: "5", asset: "USDT", starsAmount: 100, rubAmount: 300, grantKind: "credits", grantAmount: 10 });
    insertPendingInvoice(db, { provider: "platega", externalId: "tx-1", chatId: CHAT, offerId: offer.id, amount: "300", asset: "RUB" });

    const first = fulfillPendingInvoice(db, "platega", "tx-1");
    const second = fulfillPendingInvoice(db, "platega", "tx-1");

    expect(first.fulfilled).toBe(true);
    expect(second.fulfilled).toBe(false);
    expect(getUser(db, CHAT)?.credits).toBe(BONUS + 10);
    expect(getInvoice(db, "platega", "tx-1")?.status).toBe("paid");
  });
});

describe("markCanceled", () => {
  test("only flips pending rows, never paid ones", () => {
    const db = freshDb();
    const offer = createOffer(db, { title: "pack", amount: "5", asset: "USDT", starsAmount: 100, rubAmount: 300, grantKind: "credits", grantAmount: 10 });
    insertPendingInvoice(db, { provider: "platega", externalId: "tx-2", chatId: CHAT, offerId: offer.id, amount: "300", asset: "RUB" });

    expect(markCanceled(db, "platega", "tx-2")).toBe(true);
    expect(getInvoice(db, "platega", "tx-2")?.status).toBe("canceled");
    expect(markCanceled(db, "platega", "tx-2")).toBe(false);

    insertPendingInvoice(db, { provider: "platega", externalId: "tx-3", chatId: CHAT, offerId: offer.id, amount: "300", asset: "RUB" });
    fulfillPendingInvoice(db, "platega", "tx-3");
    expect(markCanceled(db, "platega", "tx-3")).toBe(false);
    expect(getInvoice(db, "platega", "tx-3")?.status).toBe("paid");
  });
});

describe("pollPlategaOnce", () => {
  test("CONFIRMED fulfills, CANCELED cancels, stale row auto-cancels without fetch", async () => {
    const db = freshDb();
    const offer = createOffer(db, { title: "pack", amount: "5", asset: "USDT", starsAmount: 100, rubAmount: 300, grantKind: "credits", grantAmount: 10 });
    insertPendingInvoice(db, { provider: "platega", externalId: "confirm-me", chatId: CHAT, offerId: offer.id, amount: "300", asset: "RUB" });
    insertPendingInvoice(db, { provider: "platega", externalId: "cancel-me", chatId: CHAT, offerId: offer.id, amount: "300", asset: "RUB" });
    // Force one row to look stale (>1h old).
    insertPendingInvoice(db, { provider: "platega", externalId: "stale", chatId: CHAT, offerId: offer.id, amount: "300", asset: "RUB" });
    db.query(`UPDATE invoices SET created_at = unixepoch() - 7200 WHERE external_id = 'stale'`).run();

    let fetchCalls = 0;
    const fetchTx = async (id: string) => {
      fetchCalls++;
      if (id === "confirm-me") return { id, status: "CONFIRMED" };
      if (id === "cancel-me") return { id, status: "CANCELED" };
      throw new Error(`unexpected fetch for ${id}`);
    };
    const fulfilled: string[] = [];
    await pollPlategaOnce(db, (r) => { if (r.offerTitle) fulfilled.push(r.offerTitle); }, fetchTx);

    expect(fetchCalls).toBe(2); // stale row skipped
    expect(getInvoice(db, "platega", "confirm-me")?.status).toBe("paid");
    expect(getInvoice(db, "platega", "cancel-me")?.status).toBe("canceled");
    expect(getInvoice(db, "platega", "stale")?.status).toBe("canceled");
    expect(fulfilled).toEqual(["pack"]);
    expect(listPendingInvoices(db, "platega").length).toBe(0);
  });
});

describe("purchaseOfferRub", () => {
  test("creates pending invoice with frozen amount/asset RUB", async () => {
    const db = freshDb();
    const offer = createOffer(db, { title: "pack", amount: "5", asset: "USDT", starsAmount: 100, rubAmount: 450, grantKind: "credits", grantAmount: 10 });
    const create = async () => ({ transactionId: "tx-9", redirect: "https://pay.example/tx-9", status: "PENDING" });

    const result = await purchaseOfferRub(db, CHAT, offer.id, create);

    expect(result.payUrl).toBe("https://pay.example/tx-9");
    const invoice = getInvoice(db, "platega", "tx-9");
    expect(invoice?.amount).toBe("450");
    expect(invoice?.asset).toBe("RUB");
    expect(invoice?.status).toBe("pending");
  });

  test("throws OfferUnavailableError for inactive/missing offer", async () => {
    const db = freshDb();
    const create = async () => ({ transactionId: "x", redirect: "https://x", status: "PENDING" });
    await expect(purchaseOfferRub(db, CHAT, 9999, create)).rejects.toBeInstanceOf(OfferUnavailableError);
  });

  test("throws RubPriceMissingError when offer has no RUB price", async () => {
    const db = freshDb();
    const offer = createOffer(db, { title: "pack", amount: "5", asset: "USDT", starsAmount: 100, grantKind: "credits", grantAmount: 10 });
    const create = async () => ({ transactionId: "x", redirect: "https://x", status: "PENDING" });
    await expect(purchaseOfferRub(db, CHAT, offer.id, create)).rejects.toBeInstanceOf(RubPriceMissingError);
  });
});
