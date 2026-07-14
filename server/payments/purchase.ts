import type { AppDb } from "../db";
import { getOffer } from "./offers-store";
import { insertPendingInvoice } from "./invoices-store";
import { createInvoice } from "./crypto-pay";

export interface PurchaseResult {
  invoiceId: number;
  payUrl: string;
  offerTitle: string;
}

export class OfferUnavailableError extends Error {}

/**
 * Creates a Crypto Pay invoice for an active offer and stores a pending record.
 * The offer's amount/asset are frozen onto the invoice at this point.
 */
export async function purchaseOffer(db: AppDb, chatId: number, offerId: number): Promise<PurchaseResult> {
  const offer = getOffer(db, offerId);
  if (!offer || !offer.active) throw new OfferUnavailableError("offer is not available");

  const invoice = await createInvoice({
    asset: offer.asset,
    amount: offer.amount,
    description: offer.title,
    payload: JSON.stringify({ chatId, offerId }),
  });

  insertPendingInvoice(db, {
    provider: "crypto",
    externalId: String(invoice.invoice_id),
    chatId,
    offerId,
    amount: offer.amount,
    asset: offer.asset,
  });

  const payUrl = invoice.mini_app_invoice_url ?? invoice.bot_invoice_url ?? invoice.pay_url ?? "";
  return { invoiceId: invoice.invoice_id, payUrl, offerTitle: offer.title };
}
