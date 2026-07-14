import type { AppDb } from "../db";
import { listUsers } from "../access/users-store";

export interface BroadcastResult {
  sent: number;
  failed: number;
}

export type SendFn = (chatId: number, text: string) => Promise<void>;

const SEND_DELAY_MS = 40; // ~25/s, under Telegram's ~30/s global limit

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Sends `text` to every recorded user, tolerating per-recipient failures
 * (blocked bot, deactivated account). Paced to respect Telegram rate limits.
 */
export async function broadcast(db: AppDb, text: string, send: SendFn): Promise<BroadcastResult> {
  const users = listUsers(db);
  let sent = 0;
  let failed = 0;
  for (const user of users) {
    try {
      await send(user.chatId, text);
      sent++;
    } catch {
      failed++;
    }
    await sleep(SEND_DELAY_MS);
  }
  return { sent, failed };
}
