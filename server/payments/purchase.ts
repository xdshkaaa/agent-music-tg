import type { AppDb } from "../db";
import { env } from "../env";
import { getOffer } from "./offers-store";
import { insertPendingInvoice } from "./invoices-store";
import { createInvoice } from "./crypto-pay";
import { createTransaction, type PlategaTransaction } from "./platega";

export interface PurchaseResult {
  invoiceId: number;
  payUrl: string;
  offerTitle: string;
}

export class OfferUnavailableError extends Error {}
export class RubPriceMissingError extends Error {}

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

/**
 * Creates a Platega СБП transaction for an active offer with a RUB price and
 * stores a pending record. The offer's rub amount is frozen onto the invoice.
 */
export async function purchaseOfferRub(
  db: AppDb,
  chatId: number,
  offerId: number,
  create: (params: {
    amountRub: number;
    description: string;
    payload: string;
    returnUrl: string;
    failedUrl: string;
  }) => Promise<PlategaTransaction> = createTransaction,
): Promise<PurchaseResult> {
  const offer = getOffer(db, offerId);
  if (!offer || !offer.active) throw new OfferUnavailableError("offer is not available");
  if (!offer.rubAmount) throw new RubPriceMissingError("offer has no RUB price");

  const tx = await create({
    amountRub: offer.rubAmount,
    description: offer.title,
    payload: JSON.stringify({ chatId, offerId }),
    returnUrl: env.publicOrigin,
    failedUrl: env.publicOrigin,
  });

  insertPendingInvoice(db, {
    provider: "platega",
    externalId: tx.transactionId,
    chatId,
    offerId,
    amount: String(offer.rubAmount),
    asset: "RUB",
  });

  return { invoiceId: 0, payUrl: tx.redirect, offerTitle: offer.title };
}
