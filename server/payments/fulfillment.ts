import type { AppDb } from "../db";
import { getInvoice, markPaid, type InvoiceProvider } from "./invoices-store";
import { getOffer } from "./offers-store";
import { addCredits, extendSubscription, refundCredits } from "../access/users-store";

export interface FulfillResult {
  fulfilled: boolean;
  chatId?: number;
  offerTitle?: string;
  provider?: InvoiceProvider;
  amount?: string;
  asset?: string;
  grantKind?: "credits" | "subscription";
  grantAmount?: number;
}

/**
 * Idempotently fulfills a paid pending-invoice payment (Crypto Pay or
 * Platega). The pending->paid transition guards the grant: only the caller
 * that actually flips the status applies credits/subscription, so duplicate
 * webhook + polling events grant exactly once.
 */
export function fulfillPendingInvoice(db: AppDb, provider: InvoiceProvider, externalId: string): FulfillResult {
  const tx = db.transaction((): FulfillResult => {
    const invoice = getInvoice(db, provider, externalId);
    if (!invoice) return { fulfilled: false };
    if (!markPaid(db, provider, externalId)) return { fulfilled: false, chatId: invoice.chatId };

    const offer = getOffer(db, invoice.offerId);
    if (!offer) return { fulfilled: true, chatId: invoice.chatId, provider, amount: invoice.amount, asset: invoice.asset };

    if (offer.grantKind === "subscription") {
      extendSubscription(db, invoice.chatId, offer.grantAmount, 0);
    } else {
      // Release the credit hold taken at invoice creation, then grant the pack
      // so the user nets exactly +grantAmount (no double count).
      if (invoice.reservedCredits > 0) refundCredits(db, invoice.chatId, invoice.reservedCredits);
      addCredits(db, invoice.chatId, offer.grantAmount, 0);
    }
    return {
      fulfilled: true,
      chatId: invoice.chatId,
      offerTitle: offer.title,
      provider,
      amount: invoice.amount,
      asset: invoice.asset,
      grantKind: offer.grantKind,
      grantAmount: offer.grantAmount,
    };
  });
  return tx();
}

/** Thin wrapper kept for existing crypto callers (webhook + poller). */
export function fulfillInvoice(db: AppDb, cryptoInvoiceId: number): FulfillResult {
  return fulfillPendingInvoice(db, "crypto", String(cryptoInvoiceId));
}
