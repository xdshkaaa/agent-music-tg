import type { AppDb } from "../db";
import type { Track } from "../music/types";

export interface GenerationRow {
  id: number;
  chatId: number;
  prompt: string;
  playlistName: string | null;
  trackCount: number | null;
  tracks: Track[];
  extendCount: number;
  createdAt: number;
  saved: boolean;
}

interface GenerationRowRaw {
  id: number;
  chat_id: number;
  prompt: string;
  playlist_name: string | null;
  track_count: number | null;
  tracks_json: string | null;
  extend_count: number;
  created_at: number;
  saved: number;
}

function parseTracks(json: string | null): Track[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as Track[]) : [];
  } catch {
    return [];
  }
}

function toGeneration(row: GenerationRowRaw): GenerationRow {
  return {
    id: row.id,
    chatId: row.chat_id,
    prompt: row.prompt,
    playlistName: row.playlist_name,
    trackCount: row.track_count,
    tracks: parseTracks(row.tracks_json),
    extendCount: row.extend_count ?? 0,
    createdAt: row.created_at,
    saved: row.saved === 1,
  };
}

export function insertGeneration(
  db: AppDb,
  chatId: number,
  prompt: string,
  playlistName: string | null,
  trackCount: number | null,
  tracks: Track[] = [],
): number {
  const info = db
    .query(
      `INSERT INTO generations (chat_id, prompt, playlist_name, track_count, tracks_json) VALUES (?, ?, ?, ?, ?)`
    )
    .run(chatId, prompt, playlistName, trackCount, JSON.stringify(tracks));
  return Number(info.lastInsertRowid);
}

export function getGeneration(db: AppDb, chatId: number, id: number): GenerationRow | null {
  const row = db
    .query<GenerationRowRaw, [number, number]>(
      `SELECT * FROM generations WHERE id = ? AND chat_id = ?`
    )
    .get(id, chatId);
  return row ? toGeneration(row) : null;
}

export function appendTracksToGeneration(
  db: AppDb,
  id: number,
  tracks: Track[],
  name?: string,
): void {
  const json = JSON.stringify(tracks);
  if (name !== undefined) {
    db.query(
      `UPDATE generations SET tracks_json = ?, track_count = ?, playlist_name = ? WHERE id = ?`
    ).run(json, tracks.length, name, id);
  } else {
    db.query(
      `UPDATE generations SET tracks_json = ?, track_count = ? WHERE id = ?`
    ).run(json, tracks.length, id);
  }
}


export function incrementExtendCount(db: AppDb, id: number): void {
  db.query(`UPDATE generations SET extend_count = extend_count + 1 WHERE id = ?`).run(id);
}

export function listGenerations(db: AppDb, chatId: number, limit = 10): GenerationRow[] {
  return db
    .query<GenerationRowRaw, [number, number]>(
      `SELECT * FROM generations WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(chatId, limit)
    .map(toGeneration);
}

/** Number of generations created at or after `sinceSeconds` (unix). */
export function countGenerationsSince(db: AppDb, chatId: number, sinceSeconds: number): number {
  const row = db.query<{ n: number }, [number, number]>(
    `SELECT COUNT(*) AS n FROM generations WHERE chat_id = ? AND created_at >= ?`
  ).get(chatId, sinceSeconds);
  return row?.n ?? 0;
}

/**
 * `created_at` of the oldest generation at or after `sinceSeconds` — the one
 * whose exit from the rolling window frees up a rate-limit slot.
 */
export function oldestGenerationSince(db: AppDb, chatId: number, sinceSeconds: number): number | null {
  const row = db.query<{ t: number | null }, [number, number]>(
    `SELECT MIN(created_at) AS t FROM generations WHERE chat_id = ? AND created_at >= ?`
  ).get(chatId, sinceSeconds);
  return row?.t ?? null;
}

export function countGenerations(db: AppDb, chatId: number): number {
  const row = db.query<{ n: number }, [number]>(
    `SELECT COUNT(*) AS n FROM generations WHERE chat_id = ?`
  ).get(chatId);
  return row?.n ?? 0;
}

export function saveGeneration(db: AppDb, chatId: number, id: number): boolean {
  const info = db
    .query(`UPDATE generations SET saved = 1 WHERE id = ? AND chat_id = ?`)
    .run(id, chatId);
  return info.changes > 0;
}

export function renameGeneration(db: AppDb, chatId: number, id: number, name: string): boolean {
  const info = db
    .query(`UPDATE generations SET playlist_name = ? WHERE id = ? AND chat_id = ?`)
    .run(name, id, chatId);
  return info.changes > 0;
}

export function unsaveGeneration(db: AppDb, chatId: number, id: number): boolean {
  const info = db
    .query(`UPDATE generations SET saved = 0 WHERE id = ? AND chat_id = ?`)
    .run(id, chatId);
  return info.changes > 0;
}

export function listSavedGenerations(db: AppDb, chatId: number): GenerationRow[] {
  return db
    .query<GenerationRowRaw, [number]>(
      `SELECT * FROM generations WHERE chat_id = ? AND saved = 1 ORDER BY created_at DESC`
    )
    .all(chatId)
    .map(toGeneration);
}

export function setActiveModel(db: AppDb, chatId: number, model: string): void {
  db.query(`UPDATE users SET active_model = ? WHERE chat_id = ?`).run(model, chatId);
}

export function getActiveModel(db: AppDb, chatId: number): string | null {
  const row = db.query<{ active_model: string | null }, [number]>(
    `SELECT active_model FROM users WHERE chat_id = ?`
  ).get(chatId);
  return row?.active_model ?? null;
}
