import type { AppDb } from "../db";

export type InvoiceStatus = "pending" | "paid";
export type InvoiceProvider = "crypto" | "stars";

export interface Invoice {
  id: number;
  provider: InvoiceProvider;
  externalId: string;
  chatId: number;
  offerId: number;
  amount: string;
  asset: string;
  status: InvoiceStatus;
  createdAt: number;
  paidAt: number | null;
}

interface InvoiceRow {
  id: number;
  provider: string;
  external_id: string;
  chat_id: number;
  offer_id: number;
  amount: string;
  asset: string;
  status: string;
  created_at: number;
  paid_at: number | null;
}

function toInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    provider: row.provider === "stars" ? "stars" : "crypto",
    externalId: row.external_id,
    chatId: row.chat_id,
    offerId: row.offer_id,
    amount: row.amount,
    asset: row.asset,
    status: row.status === "paid" ? "paid" : "pending",
    createdAt: row.created_at,
    paidAt: row.paid_at,
  };
}

export function insertPendingInvoice(
  db: AppDb,
  input: { provider: InvoiceProvider; externalId: string; chatId: number; offerId: number; amount: string; asset: string },
): void {
  db.query(
    `INSERT INTO invoices (provider, external_id, chat_id, offer_id, amount, asset, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
  ).run(input.provider, input.externalId, input.chatId, input.offerId, input.amount, input.asset);
}

/**
 * Records a Stars payment that is already paid (Telegram delivers
 * successful_payment only after the money moved — there is no pending phase).
 * Returns true only if THIS call inserted the row; duplicate deliveries of the
 * same charge id are absorbed by UNIQUE(provider, external_id) and return false,
 * so only the inserting caller applies the grant.
 */
export function insertPaidStarsInvoice(
  db: AppDb,
  input: { chargeId: string; chatId: number; offerId: number; starsAmount: number },
): boolean {
  const res = db
    .query(
      `INSERT OR IGNORE INTO invoices (provider, external_id, chat_id, offer_id, amount, asset, status, paid_at)
       VALUES ('stars', ?, ?, ?, ?, 'XTR', 'paid', unixepoch())`,
    )
    .run(input.chargeId, input.chatId, input.offerId, String(input.starsAmount));
  return res.changes === 1;
}

export function getInvoice(db: AppDb, provider: InvoiceProvider, externalId: string): Invoice | null {
  const row = db
    .query<InvoiceRow, [string, string]>(`SELECT * FROM invoices WHERE provider = ? AND external_id = ?`)
    .get(provider, externalId);
  return row ? toInvoice(row) : null;
}

export function listPendingInvoices(db: AppDb, provider: InvoiceProvider): Invoice[] {
  return db
    .query<InvoiceRow, [string]>(`SELECT * FROM invoices WHERE status = 'pending' AND provider = ? ORDER BY id`)
    .all(provider)
    .map(toInvoice);
}

export function listInvoicesForChat(db: AppDb, chatId: number): Invoice[] {
  return db
    .query<InvoiceRow, [number]>(`SELECT * FROM invoices WHERE chat_id = ? ORDER BY id DESC`)
    .all(chatId)
    .map(toInvoice);
}

/**
 * Guarded status transition pending -> paid. Returns true only if THIS call
 * flipped the row (changes === 1); concurrent webhook/poll callers therefore
 * see false and must not apply the grant a second time.
 */
export function markPaid(db: AppDb, provider: InvoiceProvider, externalId: string): boolean {
  const res = db
    .query(
      `UPDATE invoices SET status = 'paid', paid_at = unixepoch()
       WHERE provider = ? AND external_id = ? AND status = 'pending'`,
    )
    .run(provider, externalId);
  return res.changes === 1;
}
