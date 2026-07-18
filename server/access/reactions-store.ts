import type { AppDb } from "../db";

export interface DislikedTrack {
  uri: string;
  title: string;
  artist: string;
  createdAt: number;
}

interface DislikedTrackRow {
  uri: string;
  title: string;
  artist: string;
  created_at: number;
}

function toDisliked(row: DislikedTrackRow): DislikedTrack {
  return { uri: row.uri, title: row.title, artist: row.artist, createdAt: row.created_at };
}

export function addDislike(
  db: AppDb,
  chatId: number,
  track: { uri: string; title: string; artist: string },
): void {
  db.query(
    `INSERT INTO track_reactions (chat_id, uri, title, artist) VALUES (?, ?, ?, ?)
     ON CONFLICT(chat_id, uri) DO NOTHING`,
  ).run(chatId, track.uri, track.title, track.artist);
}

export function removeDislike(db: AppDb, chatId: number, uri: string): boolean {
  const info = db.query(`DELETE FROM track_reactions WHERE chat_id = ? AND uri = ?`).run(chatId, uri);
  return info.changes > 0;
}

export function isDisliked(db: AppDb, chatId: number, uri: string): boolean {
  const row = db
    .query<{ n: number }, [number, string]>(`SELECT 1 AS n FROM track_reactions WHERE chat_id = ? AND uri = ?`)
    .get(chatId, uri);
  return row !== null;
}

export function listDislikes(db: AppDb, chatId: number): DislikedTrack[] {
  return db
    .query<DislikedTrackRow, [number]>(`SELECT * FROM track_reactions WHERE chat_id = ? ORDER BY created_at DESC`)
    .all(chatId)
    .map(toDisliked);
}

/** Capped list of "artist - title" strings for the generation prompt exclusion list. */
export function listDislikedForPrompt(db: AppDb, chatId: number, limit = 50): string[] {
  return db
    .query<DislikedTrackRow, [number, number]>(
      `SELECT * FROM track_reactions WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(chatId, limit)
    .map((r) => `${r.artist} - ${r.title}`);
}

export function listDislikedUris(db: AppDb, chatId: number): Set<string> {
  return new Set(
    db.query<{ uri: string }, [number]>(`SELECT uri FROM track_reactions WHERE chat_id = ?`).all(chatId).map((r) => r.uri),
  );
}
