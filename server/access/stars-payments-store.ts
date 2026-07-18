import type { AppDb } from "../db";
import { addExtraSlots } from "./playlists-store";

/**
 * Idempotent per Telegram `successful_payment.telegram_payment_charge_id`:
 * the same charge id can arrive twice (retried update), so the INSERT is the
 * single source of truth for "already granted" — only a fresh insert grants slots.
 */
export function grantPlaylistSlotsForPayment(db: AppDb, chargeId: string, chatId: number, slots: number): boolean {
  const info = db
    .query(`INSERT INTO stars_payments (charge_id, chat_id, slots) VALUES (?, ?, ?) ON CONFLICT(charge_id) DO NOTHING`)
    .run(chargeId, chatId, slots);
  if (info.changes === 0) return false;
  addExtraSlots(db, chatId, slots);
  return true;
}
