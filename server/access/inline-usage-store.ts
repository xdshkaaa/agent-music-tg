import type { AppDb } from "../db";

/**
 * Users invoking inline search ("@bot <query>" in any chat). Deliberately
 * separate from `users`, mirroring group_chats: inline is open to anyone, not
 * just the allowlist, so most senders never sign up — this table exists
 * purely so an admin can see how much the feature is used.
 */
export interface InlineUsage {
  userId: number;
  username: string | null;
  searchCount: number;
  trackCount: number;
  firstSeen: number;
  lastSeen: number;
}

interface Row {
  user_id: number;
  username: string | null;
  search_count: number;
  track_count: number;
  first_seen: number;
  last_seen: number;
}

function toInlineUsage(row: Row): InlineUsage {
  return {
    userId: row.user_id,
    username: row.username,
    searchCount: row.search_count,
    trackCount: row.track_count,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
  };
}

/** Bumps the search counter, recording the username so admin stats can label the row; a no-op INSERT-OR-IGNORE seeds the row on first use. */
export function bumpInlineSearch(db: AppDb, userId: number, username: string | null): void {
  db.query(`INSERT INTO inline_usage (user_id, username) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING`).run(
    userId,
    username,
  );
  db.query(
    `UPDATE inline_usage SET
       username = COALESCE(?, username),
       search_count = search_count + 1,
       last_seen = unixepoch()
     WHERE user_id = ?`,
  ).run(username, userId);
}

/** Bumps the delivered-track counter (chosen_inline_result requires inline feedback to be enabled via @BotFather). */
export function bumpInlineTrack(db: AppDb, userId: number): void {
  db.query(`UPDATE inline_usage SET track_count = track_count + 1, last_seen = unixepoch() WHERE user_id = ?`).run(
    userId,
  );
}

export interface InlineStats {
  users: number;
  searches: number;
  tracks: number;
}

export function getInlineStats(db: AppDb): InlineStats {
  const row = db
    .query<{ users: number; searches: number; tracks: number }, []>(
      `SELECT
         COUNT(*) AS users,
         COALESCE(SUM(search_count), 0) AS searches,
         COALESCE(SUM(track_count), 0) AS tracks
       FROM inline_usage`,
    )
    .get();
  return {
    users: row?.users ?? 0,
    searches: row?.searches ?? 0,
    tracks: row?.tracks ?? 0,
  };
}

export function getInlineUsage(db: AppDb, userId: number): InlineUsage | null {
  const row = db.query<Row, [number]>(`SELECT * FROM inline_usage WHERE user_id = ?`).get(userId);
  return row ? toInlineUsage(row) : null;
}
