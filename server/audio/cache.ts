import type { AppDb } from "../db";

export interface CachedAudio {
  uri: string;
  tgFileId: string;
  title: string;
  artist: string;
  durationMs: number | null;
  sizeBytes: number | null;
}

interface Row {
  uri: string;
  tg_file_id: string;
  title: string;
  artist: string;
  duration_ms: number | null;
  size_bytes: number | null;
}

export function getCachedAudio(db: AppDb, uri: string): CachedAudio | null {
  const row = db
    .query<Row, [string]>(`SELECT uri, tg_file_id, title, artist, duration_ms, size_bytes FROM audio_cache WHERE uri = ?`)
    .get(uri);
  if (!row) return null;
  return {
    uri: row.uri,
    tgFileId: row.tg_file_id,
    title: row.title,
    artist: row.artist,
    durationMs: row.duration_ms,
    sizeBytes: row.size_bytes,
  };
}

/** Upsert: also refreshes a stale file_id after Telegram invalidates one. */
export function setCachedAudio(db: AppDb, entry: CachedAudio): void {
  db.run(
    `INSERT INTO audio_cache (uri, tg_file_id, title, artist, duration_ms, size_bytes)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(uri) DO UPDATE SET
       tg_file_id = excluded.tg_file_id,
       title = excluded.title,
       artist = excluded.artist,
       duration_ms = excluded.duration_ms,
       size_bytes = excluded.size_bytes`,
    [entry.uri, entry.tgFileId, entry.title, entry.artist, entry.durationMs, entry.sizeBytes],
  );
}
