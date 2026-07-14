import type { AppDb } from "../db";
import { getInvoice, markPaid } from "./invoices-store";
import { getOffer } from "./offers-store";
import { addCredits, extendSubscription } from "../access/users-store";

export interface FulfillResult {
  fulfilled: boolean;
  chatId?: number;
  offerTitle?: string;
}

/**
 * Idempotently fulfills a paid Crypto Pay invoice. The pending->paid transition
 * guards the grant: only the caller that actually flips the status applies
 * credits/subscription, so duplicate webhook + polling events grant exactly once.
 */
export function fulfillInvoice(db: AppDb, cryptoInvoiceId: number): FulfillResult {
  const externalId = String(cryptoInvoiceId);
  const tx = db.transaction((): FulfillResult => {
    const invoice = getInvoice(db, "crypto", externalId);
    if (!invoice) return { fulfilled: false };
    if (!markPaid(db, "crypto", externalId)) return { fulfilled: false, chatId: invoice.chatId };

    const offer = getOffer(db, invoice.offerId);
    if (!offer) return { fulfilled: true, chatId: invoice.chatId };

    if (offer.grantKind === "subscription") {
      extendSubscription(db, invoice.chatId, offer.grantAmount, 0);
    } else {
      addCredits(db, invoice.chatId, offer.grantAmount, 0);
    }
    return { fulfilled: true, chatId: invoice.chatId, offerTitle: offer.title };
  });
  return tx();
}
