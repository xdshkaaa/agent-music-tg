import type { AppDb } from "../db";

export const FREE_PLAYLIST_LIMIT = 2;
export const STARS_PER_SLOT = 5;

export interface Playlist {
  id: number;
  name: string;
  createdAt: number;
  trackCount: number;
}

export interface PlaylistTrack {
  uri: string;
  title: string;
  artist: string;
  artwork: string | null;
  createdAt: number;
}

export class PlaylistLimitError extends Error {
  constructor(
    public readonly limit: number,
    public readonly starsPrice: number,
  ) {
    super(`playlist limit reached (${limit})`);
  }
}

interface PlaylistRow {
  id: number;
  name: string;
  created_at: number;
  track_count: number;
}

interface PlaylistTrackRow {
  uri: string;
  title: string;
  artist: string;
  artwork: string | null;
  created_at: number;
}

function toPlaylist(row: PlaylistRow): Playlist {
  return { id: row.id, name: row.name, createdAt: row.created_at, trackCount: row.track_count };
}

function toPlaylistTrack(row: PlaylistTrackRow): PlaylistTrack {
  return { uri: row.uri, title: row.title, artist: row.artist, artwork: row.artwork, createdAt: row.created_at };
}

export function getExtraSlots(db: AppDb, chatId: number): number {
  const row = db.query<{ n: number }, [number]>(`SELECT extra_playlist_slots AS n FROM users WHERE chat_id = ?`).get(chatId);
  return row?.n ?? 0;
}

export function getPlaylistLimit(db: AppDb, chatId: number): number {
  return FREE_PLAYLIST_LIMIT + getExtraSlots(db, chatId);
}

export function countPlaylists(db: AppDb, chatId: number): number {
  const row = db.query<{ n: number }, [number]>(`SELECT COUNT(*) AS n FROM playlists WHERE chat_id = ?`).get(chatId);
  return row?.n ?? 0;
}

export function listPlaylists(db: AppDb, chatId: number): Playlist[] {
  return db
    .query<PlaylistRow, [number]>(
      `SELECT p.id, p.name, p.created_at,
              (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) AS track_count
       FROM playlists p WHERE p.chat_id = ? ORDER BY p.created_at DESC`,
    )
    .all(chatId)
    .map(toPlaylist);
}

/** Throws PlaylistLimitError when the chat is at its slot limit. */
export function createPlaylist(db: AppDb, chatId: number, name: string): Playlist {
  const limit = getPlaylistLimit(db, chatId);
  if (countPlaylists(db, chatId) >= limit) {
    throw new PlaylistLimitError(limit, STARS_PER_SLOT);
  }
  const info = db.query(`INSERT INTO playlists (chat_id, name) VALUES (?, ?)`).run(chatId, name);
  const row = db
    .query<PlaylistRow, [number]>(
      `SELECT id, name, created_at, 0 AS track_count FROM playlists WHERE id = ?`,
    )
    .get(Number(info.lastInsertRowid))!;
  return toPlaylist(row);
}

export function renamePlaylist(db: AppDb, chatId: number, id: number, name: string): boolean {
  const info = db.query(`UPDATE playlists SET name = ? WHERE id = ? AND chat_id = ?`).run(name, id, chatId);
  return info.changes > 0;
}

export function deletePlaylist(db: AppDb, chatId: number, id: number): boolean {
  const info = db.query(`DELETE FROM playlists WHERE id = ? AND chat_id = ?`).run(id, chatId);
  return info.changes > 0;
}

export function getPlaylist(db: AppDb, chatId: number, id: number): (Playlist & { tracks: PlaylistTrack[] }) | null {
  const row = db
    .query<PlaylistRow, [number, number]>(
      `SELECT p.id, p.name, p.created_at,
              (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) AS track_count
       FROM playlists p WHERE p.id = ? AND p.chat_id = ?`,
    )
    .get(id, chatId);
  if (!row) return null;
  const tracks = db
    .query<PlaylistTrackRow, [number]>(
      `SELECT uri, title, artist, artwork, created_at FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC, created_at ASC`,
    )
    .all(id)
    .map(toPlaylistTrack);
  return { ...toPlaylist(row), tracks };
}

/** Returns "added" | "duplicate" | "not_found" (playlist doesn't belong to chatId). */
export function addTrackToPlaylist(
  db: AppDb,
  chatId: number,
  playlistId: number,
  track: { uri: string; title: string; artist: string; artwork?: string | null },
): "added" | "duplicate" | "not_found" {
  const owns = db
    .query<{ n: number }, [number, number]>(`SELECT 1 AS n FROM playlists WHERE id = ? AND chat_id = ?`)
    .get(playlistId, chatId);
  if (!owns) return "not_found";
  const nextPos = db
    .query<{ n: number }, [number]>(`SELECT COALESCE(MAX(position), -1) + 1 AS n FROM playlist_tracks WHERE playlist_id = ?`)
    .get(playlistId)!.n;
  const info = db
    .query(
      `INSERT INTO playlist_tracks (playlist_id, uri, title, artist, artwork, position) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(playlist_id, uri) DO NOTHING`,
    )
    .run(playlistId, track.uri, track.title, track.artist, track.artwork ?? null, nextPos);
  return info.changes > 0 ? "added" : "duplicate";
}

export function removeTrackFromPlaylist(db: AppDb, chatId: number, playlistId: number, uri: string): boolean {
  const info = db
    .query(
      `DELETE FROM playlist_tracks WHERE uri = ? AND playlist_id = (SELECT id FROM playlists WHERE id = ? AND chat_id = ?)`,
    )
    .run(uri, playlistId, chatId);
  return info.changes > 0;
}

/** Grants extra playlist slots (Stars purchase fulfillment). */
export function addExtraSlots(db: AppDb, chatId: number, n: number): void {
  db.query(
    `UPDATE users SET extra_playlist_slots = extra_playlist_slots + ? WHERE chat_id = ?`,
  ).run(n, chatId);
}
