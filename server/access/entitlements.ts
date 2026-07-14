import type { AppDb } from "../db";
import { env } from "../env";
import { isAdmin } from "../lib/access-control";
import { getUser, consumeCredit, consumeTrialCredit, type User } from "./users-store";

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** True while the trial has credits left and its expiry is in the future. */
export function trialActive(user: User | null): boolean {
  return (
    user != null && user.trialCredits > 0 && user.trialUntil != null && user.trialUntil > nowSeconds()
  );
}

/** True while the user's subscription expiry is in the future. */
export function hasActiveSubscription(db: AppDb, chatId: number): boolean {
  const user = getUser(db, chatId);
  return user?.subscriptionUntil != null && user.subscriptionUntil > nowSeconds();
}

/**
 * Whether the chat may generate a playlist. When payments are disabled the
 * paywall is bypassed entirely (everyone has access). Otherwise access requires
 * a positive credit balance, an active trial, OR a live subscription. Admins
 * bypass the paywall.
 */
export function hasAccess(db: AppDb, chatId: number): boolean {
  if (!env.paymentsEnabled) return true;
  if (isAdmin(db, chatId)) return true;
  const user = getUser(db, chatId);
  if (!user) return false;
  if (user.credits > 0) return true;
  if (trialActive(user)) return true;
  return user.subscriptionUntil != null && user.subscriptionUntil > nowSeconds();
}

/**
 * Consumes access for one successful generation. Subscription users are not
 * charged; otherwise expiring trial credits are spent before paid credits.
 * No-op when payments disabled or the caller is an admin.
 */
export function consumeAccess(db: AppDb, chatId: number): void {
  if (!env.paymentsEnabled) return;
  if (isAdmin(db, chatId)) return;
  if (hasActiveSubscription(db, chatId)) return;
  if (consumeTrialCredit(db, chatId)) return;
  consumeCredit(db, chatId);
}
