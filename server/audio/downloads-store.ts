import type { AppDb } from "../db";

export type TrackStatus = "pending" | "sent" | "failed";
export type DownloadStatus = "pending" | "processing" | "done" | "partial" | "failed";

/**
 * A pending/processing row older than this is presumed abandoned (crash or
 * restart mid-job) rather than genuinely in flight, so it stops blocking new
 * downloads. Comfortably above worst case: 50 tracks / 2 concurrent
 * extraction slots at ~15s/extract ≈ 6-7 minutes.
 */
export const DOWNLOAD_STALE_MS = 15 * 60 * 1000;

export interface DownloadTrack {
  uri: string;
  title: string;
  artist: string;
  durationMs?: number;
  status: TrackStatus;
  /** Short failure reason, present when status = failed. */
  error?: string;
}

export interface DownloadRecord {
  id: number;
  chatId: number;
  playlistName: string;
  tracks: DownloadTrack[];
  status: DownloadStatus;
  createdAt: number;
}

interface Row {
  id: number;
  chat_id: number;
  playlist_name: string;
  tracks_json: string;
  status: DownloadStatus;
  created_at: number;
}

function fromRow(row: Row): DownloadRecord {
  return {
    id: row.id,
    chatId: row.chat_id,
    playlistName: row.playlist_name,
    tracks: JSON.parse(row.tracks_json) as DownloadTrack[],
    status: row.status,
    createdAt: row.created_at,
  };
}

export function insertDownload(
  db: AppDb,
  chatId: number,
  playlistName: string,
  tracks: Omit<DownloadTrack, "status">[],
): DownloadRecord {
  const withStatus: DownloadTrack[] = tracks.map((t) => ({ ...t, status: "pending" }));
  const row = db
    .query<Row, [number, string, string]>(
      `INSERT INTO downloads (chat_id, playlist_name, tracks_json, status, updated_at)
       VALUES (?, ?, ?, 'pending', unixepoch())
       RETURNING id, chat_id, playlist_name, tracks_json, status, created_at`,
    )
    .get(chatId, playlistName, JSON.stringify(withStatus));
  if (!row) throw new Error("failed to insert download");
  return fromRow(row);
}

/** Owner-scoped: returns null unless the record belongs to chatId. */
export function getDownload(db: AppDb, chatId: number, id: number): DownloadRecord | null {
  const row = db
    .query<Row, [number, number]>(`SELECT * FROM downloads WHERE id = ? AND chat_id = ?`)
    .get(id, chatId);
  return row ? fromRow(row) : null;
}

export function listDownloads(db: AppDb, chatId: number): DownloadRecord[] {
  const rows = db
    .query<Row, [number]>(`SELECT * FROM downloads WHERE chat_id = ? ORDER BY created_at DESC, id DESC`)
    .all(chatId);
  return rows.map(fromRow);
}

/** Owner-scoped delete. Returns false when nothing was deleted. */
export function deleteDownload(db: AppDb, chatId: number, id: number): boolean {
  const result = db.run(`DELETE FROM downloads WHERE id = ? AND chat_id = ?`, [id, chatId]);
  return result.changes > 0;
}

export function hasActiveDownload(db: AppDb, chatId: number): boolean {
  const staleBefore = Math.floor((Date.now() - DOWNLOAD_STALE_MS) / 1000);
  const row = db
    .query<{ n: number }, [number, number]>(
      `SELECT COUNT(*) AS n FROM downloads
       WHERE chat_id = ? AND status IN ('pending', 'processing') AND updated_at >= ?`,
    )
    .get(chatId, staleBefore);
  return (row?.n ?? 0) > 0;
}

export function setDownloadStatus(db: AppDb, id: number, status: DownloadStatus): void {
  db.run(`UPDATE downloads SET status = ?, updated_at = unixepoch() WHERE id = ?`, [status, id]);
}

export function setDownloadTracks(db: AppDb, id: number, tracks: DownloadTrack[]): void {
  db.run(`UPDATE downloads SET tracks_json = ?, updated_at = unixepoch() WHERE id = ?`, [JSON.stringify(tracks), id]);
}

/** done / partial / failed from per-track outcomes. */
export function finalStatusFor(tracks: DownloadTrack[]): DownloadStatus {
  const sent = tracks.filter((t) => t.status === "sent").length;
  if (sent === tracks.length) return "done";
  if (sent === 0) return "failed";
  return "partial";
}

/**
 * Finalizes every download row left at pending/processing by a previous
 * process (crash or restart mid-job), so no row can wedge the active-download
 * lock forever waiting for a job that will never resume. Call once at boot,
 * before the server accepts requests.
 */
export function reconcileStaleDownloads(db: AppDb): void {
  const rows = db
    .query<Row, []>(`SELECT * FROM downloads WHERE status IN ('pending', 'processing')`)
    .all();
  for (const row of rows) {
    const record = fromRow(row);
    setDownloadStatus(db, record.id, finalStatusFor(record.tracks));
  }
}
