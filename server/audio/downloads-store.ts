import type { AppDb } from "../db";

export type TrackStatus = "pending" | "sent" | "failed";
export type DownloadStatus = "pending" | "processing" | "done" | "partial" | "failed";

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
      `INSERT INTO downloads (chat_id, playlist_name, tracks_json, status)
       VALUES (?, ?, ?, 'pending')
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
  const row = db
    .query<{ n: number }, [number]>(
      `SELECT COUNT(*) AS n FROM downloads WHERE chat_id = ? AND status IN ('pending', 'processing')`,
    )
    .get(chatId);
  return (row?.n ?? 0) > 0;
}

export function setDownloadStatus(db: AppDb, id: number, status: DownloadStatus): void {
  db.run(`UPDATE downloads SET status = ? WHERE id = ?`, [status, id]);
}

export function setDownloadTracks(db: AppDb, id: number, tracks: DownloadTrack[]): void {
  db.run(`UPDATE downloads SET tracks_json = ? WHERE id = ?`, [JSON.stringify(tracks), id]);
}

/** done / partial / failed from per-track outcomes. */
export function finalStatusFor(tracks: DownloadTrack[]): DownloadStatus {
  const sent = tracks.filter((t) => t.status === "sent").length;
  if (sent === tracks.length) return "done";
  if (sent === 0) return "failed";
  return "partial";
}
