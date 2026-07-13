import type { AppDb } from "../db";
import { env } from "../env";

export interface ChatRole {
  chatId: number;
  isAllowed: boolean;
  isAdmin: boolean;
}

/**
 * Seeds the allowlist table from env on every boot. Env is the source of truth
 * for membership: entries present in env but missing from the table are inserted,
 * admin flags are kept in sync, and no row is ever deleted here (deploy-time
 * membership changes go through env; runtime revocation is a future admin action).
 */
export function bootstrapAllowlist(db: AppDb): void {
  const upsert = db.query(
    `INSERT INTO allowlist (chat_id, is_admin) VALUES (?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET is_admin = excluded.is_admin`
  );
  const adminSet = new Set(env.adminChatIds);
  for (const chatId of env.allowlistChatIds) {
    upsert.run(chatId, adminSet.has(chatId) ? 1 : 0);
  }
  for (const chatId of env.adminChatIds) {
    if (!env.allowlistChatIds.includes(chatId)) {
      upsert.run(chatId, 1);
    }
  }
}

export function getChatRole(db: AppDb, chatId: number): ChatRole {
  const row = db
    .query<{ is_admin: number }, [number]>(`SELECT is_admin FROM allowlist WHERE chat_id = ?`)
    .get(chatId);
  return {
    chatId,
    isAllowed: row !== null,
    isAdmin: row !== null && row.is_admin === 1,
  };
}

export function isAllowed(db: AppDb, chatId: number): boolean {
  return getChatRole(db, chatId).isAllowed;
}

export function isAdmin(db: AppDb, chatId: number): boolean {
  return getChatRole(db, chatId).isAdmin;
}
