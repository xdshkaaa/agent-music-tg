import type { AppDb } from "../db";
import { env } from "../env";
import { listPendingInvoices } from "./invoices-store";
import { getInvoices } from "./crypto-pay";
import { getTransaction, plategaEnabled } from "./platega";
import { fulfillInvoice, fulfillPendingInvoice, type FulfillResult } from "./fulfillment";
import { cancelInvoiceAndRefund } from "./cancel";

const POLL_INTERVAL_MS = 60_000;
const PLATEGA_STALE_MS = 60 * 60 * 1000;
const CRYPTO_STALE_MS = 60 * 60 * 1000;

export type OnFulfilled = (result: FulfillResult) => void | Promise<void>;

type FetchInvoices = typeof getInvoices;

export async function pollOnce(
  db: AppDb,
  onFulfilled?: OnFulfilled,
  fetchInvoices: FetchInvoices = getInvoices,
): Promise<void> {
  const pending = listPendingInvoices(db, "crypto");
  if (pending.length === 0) return;
  const now = Date.now();
  const stillPending: typeof pending = [];
  for (const inv of pending) {
    if (now - inv.createdAt * 1000 > CRYPTO_STALE_MS) {
      cancelInvoiceAndRefund(db, "crypto", inv.externalId);
    } else {
      stillPending.push(inv);
    }
  }
  if (stillPending.length === 0) return;
  const remote = await fetchInvoices(stillPending.map((i) => Number(i.externalId)));
  for (const inv of remote) {
    if (inv.status === "expired") {
      cancelInvoiceAndRefund(db, "crypto", String(inv.invoice_id));
      continue;
    }
    if (inv.status !== "paid") continue;
    const result = fulfillInvoice(db, inv.invoice_id);
    if (result.fulfilled && result.offerTitle && onFulfilled) await onFulfilled(result);
  }
}

/**
 * Starts the getInvoices polling fallback. No-op when payments are disabled or
 * no token is set. Returns a stop function.
 */
export function startPoller(db: AppDb, onFulfilled?: OnFulfilled): () => void {
  if (!env.paymentsEnabled || !env.cryptobotToken) return () => {};
  const timer = setInterval(() => {
    pollOnce(db, onFulfilled).catch((e) => console.error("[crypto-pay poller]", e));
  }, POLL_INTERVAL_MS);
  return () => clearInterval(timer);
}

type FetchTransaction = typeof getTransaction;

/**
 * Fallback for hosts with no public webhook URL (test stand): polls pending
 * Platega transactions by id. Rows older than an hour are canceled without a
 * network call (the pay link itself expires after ~15 min).
 */
export async function pollPlategaOnce(
  db: AppDb,
  onFulfilled?: OnFulfilled,
  fetchTx: FetchTransaction = getTransaction,
): Promise<void> {
  const pending = listPendingInvoices(db, "platega");
  const now = Date.now();
  for (const inv of pending) {
    if (now - inv.createdAt * 1000 > PLATEGA_STALE_MS) {
      cancelInvoiceAndRefund(db, "platega", inv.externalId);
      continue;
    }
    try {
      const tx = await fetchTx(inv.externalId);
      if (tx.status === "CONFIRMED") {
        const result = fulfillPendingInvoice(db, "platega", inv.externalId);
        if (result.fulfilled && result.offerTitle && onFulfilled) await onFulfilled(result);
      } else if (tx.status === "CANCELED" || tx.status === "CHARGEBACKED") {
        cancelInvoiceAndRefund(db, "platega", inv.externalId);
      }
    } catch (e) {
      console.error("[platega poller] tx fetch failed", inv.externalId, e);
    }
  }
}

/** Starts the Platega polling fallback. No-op when payments/Platega are disabled. */
export function startPlategaPoller(db: AppDb, onFulfilled?: OnFulfilled): () => void {
  if (!env.paymentsEnabled || !plategaEnabled()) return () => {};
  const timer = setInterval(() => {
    pollPlategaOnce(db, onFulfilled).catch((e) => console.error("[platega poller]", e));
  }, POLL_INTERVAL_MS);
  return () => clearInterval(timer);
}
