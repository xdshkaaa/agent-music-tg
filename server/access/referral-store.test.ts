import { describe, expect, test } from "bun:test";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";

const { openDb } = await import("../db");
const { applyReferral, getReferralStats } = await import("./referral-store");
const { getUser, upsertUser, SIGNUP_BONUS_CREDITS } = await import("./users-store");
const { DEFAULT_REFERRAL_REWARD_CREDITS, getReferralSettings, setReferralSettings } = await import("../lib/settings");

describe("referral rewards", () => {
  test("grants the inviter 10 generations once and keeps the invitee signup bonus", () => {
    const db = openDb(":memory:");
    const referrerChatId = 101;
    const referredChatId = 202;
    upsertUser(db, referrerChatId, "referrer");
    upsertUser(db, referredChatId, "friend");

    expect(getReferralSettings(db).rewardCredits).toBe(DEFAULT_REFERRAL_REWARD_CREDITS);
    expect(applyReferral(db, referrerChatId, referredChatId)).toBe(true);
    expect(getUser(db, referrerChatId)?.credits).toBe(
      SIGNUP_BONUS_CREDITS + DEFAULT_REFERRAL_REWARD_CREDITS,
    );
    expect(getUser(db, referredChatId)?.credits).toBe(SIGNUP_BONUS_CREDITS);
    expect(getReferralStats(db, referrerChatId)).toEqual({
      invitedCount: 1,
      creditsEarned: DEFAULT_REFERRAL_REWARD_CREDITS,
    });

    expect(applyReferral(db, referrerChatId, referredChatId)).toBe(false);
    expect(getUser(db, referrerChatId)?.credits).toBe(
      SIGNUP_BONUS_CREDITS + DEFAULT_REFERRAL_REWARD_CREDITS,
    );
  });

  test("keeps an explicitly configured referral reward", () => {
    const db = openDb(":memory:");
    setReferralSettings(db, { rewardCredits: 3 });

    expect(getReferralSettings(db).rewardCredits).toBe(3);
  });
});
