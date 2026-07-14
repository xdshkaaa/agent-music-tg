import type { AppDb } from "../db";

export type GrantHistoryType = "credits" | "subscription" | "subscription_revoked";

export interface GrantHistoryRecord {
  id: number;
  chatId: number;
  type: GrantHistoryType;
  amount: number;
  grantedBy: number;
  createdAt: number;
}

interface GrantHistoryRow {
  id: number;
  chat_id: number;
  type: GrantHistoryType;
  amount: number;
  granted_by: number;
  created_at: number;
}

function toRecord(row: GrantHistoryRow): GrantHistoryRecord {
  return {
    id: row.id,
    chatId: row.chat_id,
    type: row.type,
    amount: row.amount,
    grantedBy: row.granted_by,
    createdAt: row.created_at,
  };
}

export function insertGrantHistory(
  db: AppDb,
  chatId: number,
  type: GrantHistoryType,
  amount: number,
  grantedBy: number,
): void {
  db.query(
    `INSERT INTO grant_history (chat_id, type, amount, granted_by) VALUES (?, ?, ?, ?)`,
  ).run(chatId, type, amount, grantedBy);
}

export function getGrantHistoryForUser(db: AppDb, chatId: number): GrantHistoryRecord[] {
  return db
    .query<GrantHistoryRow, [number]>(
      `SELECT * FROM grant_history WHERE chat_id = ? ORDER BY created_at DESC`,
    )
    .all(chatId)
    .map(toRecord);
}

export function getAllGrantHistory(
  db: AppDb,
  limit: number = 50,
  offset: number = 0,
): GrantHistoryRecord[] {
  return db
    .query<GrantHistoryRow, [number, number]>(
      `SELECT * FROM grant_history ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(limit, offset)
    .map(toRecord);
}

export function countGrantHistory(db: AppDb): number {
  const row = db.query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM grant_history`).get();
  return row?.n ?? 0;
}
