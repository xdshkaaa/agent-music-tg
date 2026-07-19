import type { AppDb } from "../db";
import { addCredits, getUser } from "./users-store";
import { getReferralSettings } from "../lib/settings";

export interface ReferralStats {
  invitedCount: number;
  creditsEarned: number;
}

export function getReferralStats(db: AppDb, chatId: number): ReferralStats {
  const row = db
    .query<{ count: number; earned: number | null }, [number]>(
      `SELECT COUNT(*) AS count, SUM(credits_granted) AS earned FROM referral_events WHERE referrer_chat_id = ?`,
    )
    .get(chatId);
  return { invitedCount: row?.count ?? 0, creditsEarned: row?.earned ?? 0 };
}

/**
 * Credits the referrer for a new invitee, once. No-ops for self-referral,
 * an unknown referrer, an already-recorded invitee (dedupe — also guards
 * re-triggering on repeated /start ref_... deep-link taps), or a referrer
 * who has hit the configured cap. Returns whether a reward was granted.
 */
export function applyReferral(db: AppDb, referrerChatId: number, referredChatId: number): boolean {
  if (referrerChatId === referredChatId) return false;
  if (!getUser(db, referrerChatId)) return false;

  const already = db.query<{ id: number }, [number]>(`SELECT id FROM referral_events WHERE referred_chat_id = ?`).get(referredChatId);
  if (already) return false;

  const settings = getReferralSettings(db);
  if (settings.maxPerUser > 0) {
    const { invitedCount } = getReferralStats(db, referrerChatId);
    if (invitedCount >= settings.maxPerUser) return false;
  }

  db.query(`UPDATE users SET referred_by = ? WHERE chat_id = ?`).run(referrerChatId, referredChatId);
  db.query(
    `INSERT INTO referral_events (referrer_chat_id, referred_chat_id, credits_granted) VALUES (?, ?, ?)`,
  ).run(referrerChatId, referredChatId, settings.rewardCredits);
  addCredits(db, referrerChatId, settings.rewardCredits);
  return true;
}
