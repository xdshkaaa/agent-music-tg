import type { AppDb } from "../db";
import { insertPaidStarsInvoice } from "./invoices-store";
import { getOffer } from "./offers-store";
import { addCredits, extendSubscription } from "../access/users-store";
import type { FulfillResult } from "./fulfillment";
import { recordEvent } from "../analytics/store";

/** Payload carried through the Telegram invoice round-trip. */
export interface StarsPayload {
  chatId: number;
  offerId: number;
}

export function parseStarsPayload(raw: string): StarsPayload | null {
  try {
    const v = JSON.parse(raw) as Partial<StarsPayload>;
    if (typeof v.chatId !== "number" || typeof v.offerId !== "number") return null;
    return { chatId: v.chatId, offerId: v.offerId };
  } catch {
    return null;
  }
}

/** `slots:<chatId>:<slots>:<uuid>` — issued by POST /api/playlists/slots/invoice. */
const SLOTS_PAYLOAD_PATTERN = /^slots:(-?\d+):(\d+):/;

/**
 * Every kind of Telegram Stars invoice this bot issues.
 *
 * Two independent flows share the single `pre_checkout_query` /
 * `successful_payment` update stream, and grammY stops the middleware chain at
 * the first handler that does not call `next()`. Classifying the payload in one
 * place keeps each handler able to recognise — and pass on — the other's
 * invoices, instead of silently rejecting them.
 */
export type StarsInvoiceKind =
  | { kind: "offer"; chatId: number; offerId: number }
  | { kind: "slots"; chatId: number; slots: number }
  | { kind: "unknown" };

export function classifyStarsPayload(raw: string): StarsInvoiceKind {
  const offer = parseStarsPayload(raw);
  if (offer) return { kind: "offer", chatId: offer.chatId, offerId: offer.offerId };

  const slots = SLOTS_PAYLOAD_PATTERN.exec(raw);
  if (slots) {
    const chatId = Number(slots[1]);
    const count = Number(slots[2]);
    if (Number.isInteger(chatId) && Number.isInteger(count) && count > 0) {
      return { kind: "slots", chatId, slots: count };
    }
  }
  return { kind: "unknown" };
}

/**
 * Idempotently fulfills a Telegram Stars payment. The INSERT OR IGNORE on the
 * unique (provider, external_id) is the guard: only the caller that actually
 * inserted the row applies the grant, so duplicate successful_payment
 * deliveries grant exactly once.
 */
export function fulfillStarsPayment(
  db: AppDb,
  input: { chargeId: string; chatId: number; offerId: number; starsAmount: number },
): FulfillResult {
  const tx = db.transaction((): FulfillResult => {
    if (!insertPaidStarsInvoice(db, input)) return { fulfilled: false, chatId: input.chatId };

    const invoice = db
      .query<{ id: number }, [string]>(`SELECT id FROM invoices WHERE provider = 'stars' AND external_id = ?`)
      .get(input.chargeId);
    recordEvent(
      db,
      input.chatId,
      "purchase_completed",
      { provider: "stars", offerId: input.offerId, amount: String(input.starsAmount), asset: "XTR" },
      invoice ? `purchase:${invoice.id}` : `stars-purchase:${input.chargeId}`,
    );

    const offer = getOffer(db, input.offerId);
    if (!offer) return { fulfilled: true, chatId: input.chatId, provider: "stars", amount: String(input.starsAmount), asset: "XTR" };

    if (offer.grantKind === "subscription") {
      extendSubscription(db, input.chatId, offer.grantAmount, 0);
    } else {
      addCredits(db, input.chatId, offer.grantAmount, 0);
    }
    return {
      fulfilled: true,
      chatId: input.chatId,
      offerTitle: offer.title,
      provider: "stars",
      amount: String(input.starsAmount),
      asset: "XTR",
      grantKind: offer.grantKind,
      grantAmount: offer.grantAmount,
    };
  });
  return tx();
}
