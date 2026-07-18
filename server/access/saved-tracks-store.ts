import type { AppDb } from "../db";

export interface SavedTrack {
  uri: string;
  title: string;
  artist: string;
  artwork: string | null;
  createdAt: number;
}

interface SavedTrackRow {
  uri: string;
  title: string;
  artist: string;
  artwork: string | null;
  created_at: number;
}

function toSavedTrack(row: SavedTrackRow): SavedTrack {
  return { uri: row.uri, title: row.title, artist: row.artist, artwork: row.artwork, createdAt: row.created_at };
}

export function addSavedTrack(
  db: AppDb,
  chatId: number,
  track: { uri: string; title: string; artist: string; artwork?: string | null },
): void {
  db.query(
    `INSERT INTO saved_tracks (chat_id, uri, title, artist, artwork) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(chat_id, uri) DO NOTHING`
  ).run(chatId, track.uri, track.title, track.artist, track.artwork ?? null);
}

export function removeSavedTrack(db: AppDb, chatId: number, uri: string): boolean {
  const info = db.query(`DELETE FROM saved_tracks WHERE chat_id = ? AND uri = ?`).run(chatId, uri);
  return info.changes > 0;
}

export function isSavedTrack(db: AppDb, chatId: number, uri: string): boolean {
  const row = db.query<{ n: number }, [number, string]>(`SELECT 1 AS n FROM saved_tracks WHERE chat_id = ? AND uri = ?`).get(chatId, uri);
  return row !== null;
}

export function listSavedTracks(db: AppDb, chatId: number): SavedTrack[] {
  return db
    .query<SavedTrackRow, [number]>(
      `SELECT * FROM saved_tracks WHERE chat_id = ? ORDER BY created_at DESC`
    )
    .all(chatId)
    .map(toSavedTrack);
}
