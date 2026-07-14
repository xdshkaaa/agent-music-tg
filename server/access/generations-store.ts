import type { AppDb } from "../db";

export interface GenerationRow {
  id: number;
  chatId: number;
  prompt: string;
  playlistName: string | null;
  trackCount: number | null;
  createdAt: number;
}

interface GenerationRowRaw {
  id: number;
  chat_id: number;
  prompt: string;
  playlist_name: string | null;
  track_count: number | null;
  created_at: number;
}

function toGeneration(row: GenerationRowRaw): GenerationRow {
  return {
    id: row.id,
    chatId: row.chat_id,
    prompt: row.prompt,
    playlistName: row.playlist_name,
    trackCount: row.track_count,
    createdAt: row.created_at,
  };
}

export function insertGeneration(
  db: AppDb,
  chatId: number,
  prompt: string,
  playlistName: string | null,
  trackCount: number | null,
): void {
  db.query(
    `INSERT INTO generations (chat_id, prompt, playlist_name, track_count) VALUES (?, ?, ?, ?)`
  ).run(chatId, prompt, playlistName, trackCount);
}

export function listGenerations(db: AppDb, chatId: number, limit = 10): GenerationRow[] {
  return db
    .query<GenerationRowRaw, [number, number]>(
      `SELECT * FROM generations WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(chatId, limit)
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
