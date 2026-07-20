import type { AppDb } from "../db";
import { insertGrantHistory } from "../admin/grant-history";

export interface User {
  chatId: number;
  username: string | null;
  firstName: string | null;
  photoFileId: string | null;
  credits: number;
  subscriptionUntil: number | null;
  trialCredits: number;
  trialUntil: number | null;
  trialClaimedAt: number | null;
  firstSeen: number;
  lastSeen: number;
  musicBackend: string | null;
}

interface UserRow {
  chat_id: number;
  username: string | null;
  first_name: string | null;
  photo_file_id: string | null;
  credits: number;
  subscription_until: number | null;
  trial_credits: number;
  trial_until: number | null;
  trial_claimed_at: number | null;
  first_seen: number;
  last_seen: number;
  music_backend: string | null;
}

function toUser(row: UserRow): User {
  return {
    chatId: row.chat_id,
    username: row.username,
    firstName: row.first_name,
    photoFileId: row.photo_file_id,
    credits: row.credits,
    subscriptionUntil: row.subscription_until,
    trialCredits: row.trial_credits,
    trialUntil: row.trial_until,
    trialClaimedAt: row.trial_claimed_at,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    musicBackend: row.music_backend,
  };
}

/**
 * One-time welcome grant. Applied only when the user row is first INSERTed
 * (upsertUser / ensureUser) — row creation is atomic, so repeated contact can
 * never grant twice and existing users are never touched.
 */
export const SIGNUP_BONUS_CREDITS = 10;

// Some internal calls invoke upsertUser without Telegram identity, purely to
// bump last_seen. Throttle those writes so a burst of requests from one active
// chat doesn't turn into a write per request. Keyed per-db (not
// just chatId) so separate AppDb instances — as in tests, each opening its
// own :memory: db and reusing the same chat ids — never share throttle state.
const LAST_SEEN_THROTTLE_MS = 60_000;
const LAST_SEEN_MAX_CHATS = 10_000;
const recentlySeenByDb = new WeakMap<AppDb, Map<number, number>>();

/**
 * Records the chat as a known user and refreshes Telegram identity/last_seen.
 * Returns true the first time a chat_id is ever recorded, so callers can
 * fire new-user side effects (e.g. admin alerts) exactly once.
 */
export function upsertUser(
  db: AppDb,
  chatId: number,
  username?: string | null,
  firstName?: string | null,
): boolean {
  if (username == null) {
    let recentlySeen = recentlySeenByDb.get(db);
    if (!recentlySeen) {
      recentlySeen = new Map();
      recentlySeenByDb.set(db, recentlySeen);
    }
    const last = recentlySeen.get(chatId);
    const now = Date.now();
    if (last !== undefined && now - last < LAST_SEEN_THROTTLE_MS) return false;
    if (recentlySeen.size >= LAST_SEEN_MAX_CHATS) {
      const oldestKey = recentlySeen.keys().next().value;
      if (oldestKey !== undefined) recentlySeen.delete(oldestKey);
    }
    recentlySeen.set(chatId, now);
  }
  const isNew = getUser(db, chatId) === null;
  db.query(
    `INSERT INTO users (chat_id, username, first_name, credits, last_seen) VALUES (?, ?, ?, ?, unixepoch())
     ON CONFLICT(chat_id) DO UPDATE SET
       username = COALESCE(excluded.username, users.username),
       first_name = COALESCE(excluded.first_name, users.first_name),
       last_seen = unixepoch()`,
  ).run(chatId, username ?? null, firstName ?? null, SIGNUP_BONUS_CREDITS);
  return isNew;
}

export function getUser(db: AppDb, chatId: number): User | null {
  const row = db.query<UserRow, [number]>(`SELECT * FROM users WHERE chat_id = ?`).get(chatId);
  return row ? toUser(row) : null;
}

export function listUsers(db: AppDb): User[] {
  return db.query<UserRow, []>(`SELECT * FROM users ORDER BY chat_id`).all().map(toUser);
}

export function countUsers(db: AppDb): number {
  const row = db.query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM users`).get();
  return row?.n ?? 0;
}

/** Ensures a row exists (used before granting to a buyer not yet recorded). */
function ensureUser(db: AppDb, chatId: number): void {
  db.query(`INSERT INTO users (chat_id, credits) VALUES (?, ?) ON CONFLICT(chat_id) DO NOTHING`).run(
    chatId,
    SIGNUP_BONUS_CREDITS,
  );
}

export function addCredits(db: AppDb, chatId: number, amount: number, grantedBy?: number): void {
  ensureUser(db, chatId);
  db.query(`UPDATE users SET credits = credits + ? WHERE chat_id = ?`).run(amount, chatId);
  if (grantedBy !== undefined) {
    insertGrantHistory(db, chatId, "credits", amount, grantedBy);
  }
}

/** Extends subscription by `days`, starting from max(now, current expiry). */
export function extendSubscription(db: AppDb, chatId: number, days: number, grantedBy?: number): void {
  ensureUser(db, chatId);
  const now = Math.floor(Date.now() / 1000);
  const user = getUser(db, chatId);
  const base = user?.subscriptionUntil && user.subscriptionUntil > now ? user.subscriptionUntil : now;
  const until = base + days * 86400;
  db.query(`UPDATE users SET subscription_until = ? WHERE chat_id = ?`).run(until, chatId);
  if (grantedBy !== undefined) {
    insertGrantHistory(db, chatId, "subscription", days, grantedBy);
  }
}

/** Admin: revokes subscription by setting subscription_until to NULL. */
export function revokeSubscription(db: AppDb, chatId: number, grantedBy?: number): void {
  ensureUser(db, chatId);
  db.query(`UPDATE users SET subscription_until = NULL WHERE chat_id = ?`).run(chatId);
  if (grantedBy !== undefined) {
    insertGrantHistory(db, chatId, "subscription_revoked", 0, grantedBy);
  }
}

export function setPhotoFileId(db: AppDb, chatId: number, fileId: string): void {
  ensureUser(db, chatId);
  db.query(`UPDATE users SET photo_file_id = ? WHERE chat_id = ?`).run(fileId, chatId);
}

/** Per-user music provider override. `null` clears it back to the admin default. */
export function setUserMusicBackend(db: AppDb, chatId: number, backend: string | null): void {
  ensureUser(db, chatId);
  db.query(`UPDATE users SET music_backend = ? WHERE chat_id = ?`).run(backend, chatId);
}

export function getUserMusicBackend(db: AppDb, chatId: number): string | null {
  const row = db
    .query<{ music_backend: string | null }, [number]>(`SELECT music_backend FROM users WHERE chat_id = ?`)
    .get(chatId);
  return row?.music_backend ?? null;
}

/**
 * One-time free trial: expiring credits claimed explicitly (bot /buy or Mini
 * App shop). trial_claimed_at IS NULL guards the grant atomically, so
 * concurrent or repeated claims can never grant twice.
 */
export const TRIAL_CREDITS = 10;
export const TRIAL_DAYS = 3;

/** Claims the trial. Returns false when this chat already claimed it. */
export function claimTrial(db: AppDb, chatId: number): boolean {
  ensureUser(db, chatId);
  const res = db
    .query(
      `UPDATE users
       SET trial_credits = ?, trial_until = unixepoch() + ? * 86400, trial_claimed_at = unixepoch()
       WHERE chat_id = ? AND trial_claimed_at IS NULL`,
    )
    .run(TRIAL_CREDITS, TRIAL_DAYS, chatId);
  return res.changes === 1;
}

/**
 * Decrements one trial credit while the trial is active. Expiry is enforced in
 * the same statement, so expired trial credits can never be spent.
 */
export function consumeTrialCredit(db: AppDb, chatId: number): boolean {
  const res = db
    .query(
      `UPDATE users SET trial_credits = trial_credits - 1
       WHERE chat_id = ? AND trial_credits > 0 AND trial_until > unixepoch()`,
    )
    .run(chatId);
  return res.changes === 1;
}

/** Admin: resets the trial so the user can claim it again. */
export function resetTrial(db: AppDb, chatId: number): void {
  db.query(
    `UPDATE users SET trial_credits = 0, trial_until = NULL, trial_claimed_at = NULL WHERE chat_id = ?`,
  ).run(chatId);
}

/** Decrements one credit if the balance is positive. Returns true if consumed. */
export function consumeCredit(db: AppDb, chatId: number): boolean {
  const res = db
    .query(`UPDATE users SET credits = credits - 1 WHERE chat_id = ? AND credits > 0`)
    .run(chatId);
  return res.changes === 1;
}

/**
 * Earmarks up to `n` generation credits as a hold while a credits invoice is
 * pending. Deducts the smaller of `n` and the current balance (never goes
 * negative), and returns the amount actually reserved so fulfillment can
 * release it and cancellation can roll it back.
 */
export function reserveCredits(db: AppDb, chatId: number, n: number): number {
  if (n <= 0) return 0;
  const current = getUser(db, chatId);
  const balance = current?.credits ?? 0;
  const reserved = Math.min(n, balance);
  if (reserved > 0) {
    db.query(`UPDATE users SET credits = credits - ? WHERE chat_id = ?`).run(reserved, chatId);
  }
  return reserved;
}

/** Refunds `n` generation credits (used to release a hold or roll one back). */
export function refundCredits(db: AppDb, chatId: number, n: number): void {
  if (n <= 0) return;
  addCredits(db, chatId, n);
}
