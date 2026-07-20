import type { AppDb } from "../db";

export const MUSIC_FEEDBACK_EVENTS = ["play_started", "play_completed", "skipped"] as const;
export type MusicFeedbackEvent = (typeof MUSIC_FEEDBACK_EVENTS)[number];

export interface MusicFeedbackTrack {
  uri: string;
  title: string;
  artist: string;
}

export interface MusicFeedbackRow extends MusicFeedbackTrack {
  chatId: number;
  playStartedCount: number;
  playCompletedCount: number;
  skippedCount: number;
  createdAt: number;
  updatedAt: number;
}

interface MusicFeedbackRaw {
  chat_id: number;
  uri: string;
  title: string;
  artist: string;
  play_started_count: number;
  play_completed_count: number;
  skipped_count: number;
  created_at: number;
  updated_at: number;
}

function toRow(row: MusicFeedbackRaw): MusicFeedbackRow {
  return {
    chatId: row.chat_id,
    uri: row.uri,
    title: row.title,
    artist: row.artist,
    playStartedCount: row.play_started_count,
    playCompletedCount: row.play_completed_count,
    skippedCount: row.skipped_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function isMusicFeedbackEvent(value: unknown): value is MusicFeedbackEvent {
  return typeof value === "string" && (MUSIC_FEEDBACK_EVENTS as readonly string[]).includes(value);
}

/** Aggregates repeat events into one bounded user+track row. */
export function recordMusicFeedback(
  db: AppDb,
  chatId: number,
  event: MusicFeedbackEvent,
  track: MusicFeedbackTrack,
): void {
  const started = event === "play_started" ? 1 : 0;
  const completed = event === "play_completed" ? 1 : 0;
  const skipped = event === "skipped" ? 1 : 0;
  db.query(
    `INSERT INTO music_feedback (
       chat_id, uri, title, artist, play_started_count, play_completed_count, skipped_count
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(chat_id, uri) DO UPDATE SET
       title = excluded.title,
       artist = excluded.artist,
       play_started_count = music_feedback.play_started_count + excluded.play_started_count,
       play_completed_count = music_feedback.play_completed_count + excluded.play_completed_count,
       skipped_count = music_feedback.skipped_count + excluded.skipped_count,
       updated_at = unixepoch()`,
  ).run(chatId, track.uri, track.title, track.artist, started, completed, skipped);
}

export function listRecentMusicFeedback(db: AppDb, chatId: number, limit = 100): MusicFeedbackRow[] {
  const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 200));
  return db
    .query<MusicFeedbackRaw, [number, number]>(
      `SELECT * FROM music_feedback WHERE chat_id = ? ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(chatId, boundedLimit)
    .map(toRow);
}

export function getMusicFeedback(db: AppDb, chatId: number, uri: string): MusicFeedbackRow | null {
  const row = db
    .query<MusicFeedbackRaw, [number, string]>(
      `SELECT * FROM music_feedback WHERE chat_id = ? AND uri = ?`,
    )
    .get(chatId, uri);
  return row ? toRow(row) : null;
}
