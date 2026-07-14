import type { AppDb } from "../db";
import { env } from "../env";

export interface ChatRole {
  chatId: number;
  isAllowed: boolean;
  isAdmin: boolean;
}

/**
 * Seeds the allowlist table from env on first boot only.
 * Uses INSERT OR IGNORE so runtime changes survive restarts.
 * Admin flags from env are still applied for new entries.
 */
export function bootstrapAllowlist(db: AppDb): void {
  const insertIgnore = db.query(
    `INSERT OR IGNORE INTO allowlist (chat_id, is_admin) VALUES (?, ?)`,
  );
  const setAdmin = db.query(
    `UPDATE allowlist SET is_admin = ? WHERE chat_id = ?`,
  );
  const adminSet = new Set(env.adminChatIds);
  for (const chatId of env.allowlistChatIds) {
    insertIgnore.run(chatId, adminSet.has(chatId) ? 1 : 0);
    if (adminSet.has(chatId)) {
      setAdmin.run(1, chatId);
    }
  }
  for (const chatId of env.adminChatIds) {
    if (!env.allowlistChatIds.includes(chatId)) {
      insertIgnore.run(chatId, 1);
      setAdmin.run(1, chatId);
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

// --- Runtime allowlist management (admin panel) -------------------------

export interface AllowlistEntry {
  chatId: number;
  isAdmin: boolean;
  createdAt: number;
}

export function getAllowlist(db: AppDb): AllowlistEntry[] {
  return db
    .query<{ chat_id: number; is_admin: number; created_at: number }, []>(
      `SELECT chat_id, is_admin, created_at FROM allowlist ORDER BY created_at DESC`,
    )
    .all()
    .map((r) => ({ chatId: r.chat_id, isAdmin: r.is_admin === 1, createdAt: r.created_at }));
}

export function addToAllowlist(db: AppDb, chatId: number, isAdminFlag: boolean): void {
  db.query(
    `INSERT INTO allowlist (chat_id, is_admin) VALUES (?, ?) ON CONFLICT(chat_id) DO UPDATE SET is_admin = excluded.is_admin`,
  ).run(chatId, isAdminFlag ? 1 : 0);
}

export function removeFromAllowlist(db: AppDb, chatId: number): void {
  db.query(`DELETE FROM allowlist WHERE chat_id = ?`).run(chatId);
}

export function setChatAdminRole(db: AppDb, chatId: number, isAdminFlag: boolean): void {
  db.query(
    `INSERT INTO allowlist (chat_id, is_admin, created_at) VALUES (?, ?, unixepoch())
     ON CONFLICT(chat_id) DO UPDATE SET is_admin = ?`,
  ).run(chatId, isAdminFlag ? 1 : 0, isAdminFlag ? 1 : 0);
}
