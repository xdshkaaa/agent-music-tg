import type { AppDb } from "../db";
import { insertPaidStarsInvoice } from "./invoices-store";
import { getOffer } from "./offers-store";
import { addCredits, extendSubscription } from "../access/users-store";
import type { FulfillResult } from "./fulfillment";

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
