import type { AppDb } from "../db";
import { env } from "../env";
import { listPendingInvoices } from "./invoices-store";
import { getInvoices } from "./crypto-pay";
import { fulfillInvoice, type FulfillResult } from "./fulfillment";

const POLL_INTERVAL_MS = 60_000;

export type OnFulfilled = (result: FulfillResult) => void | Promise<void>;

async function pollOnce(db: AppDb, onFulfilled?: OnFulfilled): Promise<void> {
  const pending = listPendingInvoices(db, "crypto");
  if (pending.length === 0) return;
  const remote = await getInvoices(pending.map((i) => Number(i.externalId)));
  for (const inv of remote) {
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
