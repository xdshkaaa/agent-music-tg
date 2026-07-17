import type { AppDb } from "../db";
import type { AgentMessage } from "../agent/types";

export interface PendingClarify {
  kind: "awaiting_clarify";
  originalPrompt: string;
  messages: AgentMessage[];
  question: string;
  options: string[];
  round: number;
}

/** Admin multi-step flows keyed off the same per-chat session row. */
export type AdminFlow =
  | { kind: "admin_add_offer"; step: "title" | "amount" | "asset" | "starsAmount" | "rubAmount" | "grantKind" | "grantAmount"; draft: Record<string, string> }
  | { kind: "admin_broadcast" }
  | { kind: "admin_setting"; field: "shopName" | "supportContact" | "aboutText" }
  | { kind: "admin_grant_credits"; chatId: number }
  | { kind: "admin_extend_subscription"; chatId: number }
  | { kind: "admin_access_add" }
  | { kind: "admin_provider_config_set"; providerId: string; field: "model" | "baseUrl" }
  | { kind: "admin_payments_toggle" }
  | { kind: "admin_all_settings_key" }
  | { kind: "admin_all_settings_value"; key: string }
  | { kind: "admin_add_channel"; step: "input" }
  | { kind: "admin_trial_reset" }
  | { kind: "admin_issuance_credits_chatid" }
  | { kind: "admin_issuance_credits_amount"; targetId: number }
  | { kind: "admin_issuance_sub_chatid" }
  | { kind: "admin_issuance_sub_days"; targetId: number }
  | { kind: "admin_issuance_revoke_chatid" };

export type SessionState = PendingClarify | AdminFlow;

function readState<T extends SessionState>(db: AppDb, chatId: number, kinds: string[]): T | null {
  const row = db.query<{ state: string }, [number]>(`SELECT state FROM sessions WHERE chat_id = ?`).get(chatId);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.state) as SessionState;
    return kinds.includes(parsed.kind) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

function writeState(db: AppDb, chatId: number, state: SessionState): void {
  db.query(
    `INSERT INTO sessions (chat_id, state) VALUES (?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET state = excluded.state, updated_at = unixepoch()`
  ).run(chatId, JSON.stringify(state));
}

export function getPendingClarify(db: AppDb, chatId: number): PendingClarify | null {
  return readState<PendingClarify>(db, chatId, ["awaiting_clarify"]);
}

export function setPendingClarify(db: AppDb, chatId: number, pending: PendingClarify): void {
  writeState(db, chatId, pending);
}

const ADMIN_FLOW_KINDS = [
  "admin_add_offer", "admin_broadcast", "admin_setting",
  "admin_grant_credits", "admin_extend_subscription", "admin_access_add",
  "admin_provider_config_set", "admin_payments_toggle",
  "admin_all_settings_key", "admin_all_settings_value",
  "admin_add_channel", "admin_trial_reset",
  "admin_issuance_credits_chatid", "admin_issuance_credits_amount",
  "admin_issuance_sub_chatid", "admin_issuance_sub_days",
  "admin_issuance_revoke_chatid",
];

export function getAdminFlow(db: AppDb, chatId: number): AdminFlow | null {
  return readState<AdminFlow>(db, chatId, ADMIN_FLOW_KINDS);
}

export function setAdminFlow(db: AppDb, chatId: number, flow: AdminFlow): void {
  writeState(db, chatId, flow);
}

export function clearSession(db: AppDb, chatId: number): void {
  db.query(`DELETE FROM sessions WHERE chat_id = ?`).run(chatId);
}
