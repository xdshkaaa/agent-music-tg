import type { AppDb } from "../db";

export type InvoiceStatus = "pending" | "paid" | "canceled";
export type InvoiceProvider = "crypto" | "stars" | "platega";

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
  reservedCredits: number;
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
  reserved_credits: number;
}

function toInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    provider: row.provider === "stars" ? "stars" : row.provider === "platega" ? "platega" : "crypto",
    externalId: row.external_id,
    chatId: row.chat_id,
    offerId: row.offer_id,
    amount: row.amount,
    asset: row.asset,
    status: row.status === "paid" ? "paid" : row.status === "canceled" ? "canceled" : "pending",
    createdAt: row.created_at,
    paidAt: row.paid_at,
    reservedCredits: row.reserved_credits ?? 0,
  };
}

export function insertPendingInvoice(
  db: AppDb,
  input: {
    provider: InvoiceProvider;
    externalId: string;
    chatId: number;
    offerId: number;
    amount: string;
    asset: string;
    reservedCredits?: number;
  },
): void {
  db.query(
    `INSERT INTO invoices (provider, external_id, chat_id, offer_id, amount, asset, status, reserved_credits)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ).run(
    input.provider,
    input.externalId,
    input.chatId,
    input.offerId,
    input.amount,
    input.asset,
    input.reservedCredits ?? 0,
  );
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

export function getInvoiceById(db: AppDb, id: number): Invoice | null {
  const row = db.query<InvoiceRow, [number]>(`SELECT * FROM invoices WHERE id = ?`).get(id);
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

/**
 * Guarded status transition pending -> canceled. Returns the canceled invoice
 * (with its reserved-credit hold) when THIS call flipped the row, or null when
 * the invoice was already paid/canceled/missing — so the caller can roll back
 * the held generations exactly once.
 */
export function markCanceled(db: AppDb, provider: InvoiceProvider, externalId: string): Invoice | null {
  const res = db
    .query(
      `UPDATE invoices SET status = 'canceled'
       WHERE provider = ? AND external_id = ? AND status = 'pending'`,
    )
    .run(provider, externalId);
  if (res.changes !== 1) return null;
  return getInvoice(db, provider, externalId);
}
