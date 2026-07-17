import type { AppDb } from "../db";
import { markCanceled, type InvoiceProvider } from "./invoices-store";
import { refundCredits } from "../access/users-store";

export interface CancelResult {
  canceled: boolean;
  chatId?: number;
  refundedCredits?: number;
}

/**
 * Cancels a pending invoice and rolls back any generation credits that were
 * held when it was created. Idempotent: only the caller that actually flips
 * the row to `canceled` applies the refund, so a duplicate webhook/poll can
 * never refund twice.
 */
export function cancelInvoiceAndRefund(db: AppDb, provider: InvoiceProvider, externalId: string): CancelResult {
  const invoice = markCanceled(db, provider, externalId);
  if (!invoice) return { canceled: false };
  if (invoice.reservedCredits > 0) {
    refundCredits(db, invoice.chatId, invoice.reservedCredits);
  }
  return { canceled: true, chatId: invoice.chatId, refundedCredits: invoice.reservedCredits };
}
