import type { AppDb } from "../db";

/**
 * Group chats using the keyword search feature. Deliberately separate from
 * `users`: a group is not a person, so it must not collect signup credits, a
 * "new user" admin alert, or a seat in per-user analytics/broadcast. This
 * table exists purely so an admin can see how many groups are active and how
 * much they're using the feature.
 */
export interface GroupChat {
  chatId: number;
  title: string | null;
  addedByChatId: number | null;
  searchCount: number;
  trackCount: number;
  leftAt: number | null;
  firstSeen: number;
  lastSeen: number;
}

interface Row {
  chat_id: number;
  title: string | null;
  added_by_chat_id: number | null;
  search_count: number;
  track_count: number;
  left_at: number | null;
  first_seen: number;
  last_seen: number;
}

function toGroupChat(row: Row): GroupChat {
  return {
    chatId: row.chat_id,
    title: row.title,
    addedByChatId: row.added_by_chat_id,
    searchCount: row.search_count,
    trackCount: row.track_count,
    leftAt: row.left_at,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
  };
}

/** Records the bot joining (or still being in) a group; clears any prior left_at. */
export function upsertGroupChat(
  db: AppDb,
  chatId: number,
  title: string | null,
  addedByChatId: number | null,
): void {
  db.query(
    `INSERT INTO group_chats (chat_id, title, added_by_chat_id, last_seen)
     VALUES (?, ?, ?, unixepoch())
     ON CONFLICT(chat_id) DO UPDATE SET
       title = COALESCE(excluded.title, group_chats.title),
       added_by_chat_id = COALESCE(group_chats.added_by_chat_id, excluded.added_by_chat_id),
       left_at = NULL,
       last_seen = unixepoch()`,
  ).run(chatId, title, addedByChatId);
}

/** Marks the bot as removed from the group without losing its lifetime counters. */
export function markGroupLeft(db: AppDb, chatId: number): void {
  db.query(`UPDATE group_chats SET left_at = unixepoch() WHERE chat_id = ?`).run(chatId);
}

/** Bumps the search counter and last_seen; a no-op INSERT-OR-IGNORE guards against a missed join event. */
export function bumpGroupSearch(db: AppDb, chatId: number): void {
  db.query(`INSERT INTO group_chats (chat_id) VALUES (?) ON CONFLICT(chat_id) DO NOTHING`).run(chatId);
  db.query(`UPDATE group_chats SET search_count = search_count + 1, last_seen = unixepoch() WHERE chat_id = ?`).run(
    chatId,
  );
}

/** Bumps the delivered-track counter (a search can succeed without a send, e.g. cache miss failure). */
export function bumpGroupTrack(db: AppDb, chatId: number): void {
  db.query(`UPDATE group_chats SET track_count = track_count + 1, last_seen = unixepoch() WHERE chat_id = ?`).run(
    chatId,
  );
}

export interface GroupStats {
  total: number;
  active: number;
  searches: number;
  tracks: number;
}

/** `active` = groups the bot is still a member of (left_at IS NULL). */
export function getGroupStats(db: AppDb): GroupStats {
  const row = db
    .query<{ total: number; active: number; searches: number; tracks: number }, []>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN left_at IS NULL THEN 1 ELSE 0 END) AS active,
         COALESCE(SUM(search_count), 0) AS searches,
         COALESCE(SUM(track_count), 0) AS tracks
       FROM group_chats`,
    )
    .get();
  return {
    total: row?.total ?? 0,
    active: row?.active ?? 0,
    searches: row?.searches ?? 0,
    tracks: row?.tracks ?? 0,
  };
}

export function getGroupChat(db: AppDb, chatId: number): GroupChat | null {
  const row = db.query<Row, [number]>(`SELECT * FROM group_chats WHERE chat_id = ?`).get(chatId);
  return row ? toGroupChat(row) : null;
}
