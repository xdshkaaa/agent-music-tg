import type { AppDb } from "../db";
import type { AgentMessage } from "../agent/types";

export interface PendingClarify {
  kind: "awaiting_clarify";
  messages: AgentMessage[];
  question: string;
  options: string[];
}

export function getPendingClarify(db: AppDb, chatId: number): PendingClarify | null {
  const row = db.query<{ state: string }, [number]>(`SELECT state FROM sessions WHERE chat_id = ?`).get(chatId);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.state) as PendingClarify;
    return parsed.kind === "awaiting_clarify" ? parsed : null;
  } catch {
    return null;
  }
}

export function setPendingClarify(db: AppDb, chatId: number, pending: PendingClarify): void {
  db.query(
    `INSERT INTO sessions (chat_id, state) VALUES (?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET state = excluded.state, updated_at = unixepoch()`
  ).run(chatId, JSON.stringify(pending));
}

export function clearSession(db: AppDb, chatId: number): void {
  db.query(`DELETE FROM sessions WHERE chat_id = ?`).run(chatId);
}
