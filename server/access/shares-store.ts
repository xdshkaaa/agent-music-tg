import type { AppDb } from "../db";
import type { Track } from "../music/types";

export type ShareSourceKind = "generation" | "playlist";

export interface ShareSnapshot {
  token: string;
  ownerChatId: number;
  sourceKind: ShareSourceKind;
  sourceId: number;
  name: string;
  prompt: string | null;
  tracks: Track[];
  viewCount: number;
  revokedAt: number | null;
  createdAt: number;
}

export interface ShareInput {
  sourceKind: ShareSourceKind;
  sourceId: number;
  name: string;
  prompt: string | null;
  tracks: Track[];
}

interface ShareRow {
  token: string;
  owner_chat_id: number;
  source_kind: string;
  source_id: number;
  name: string;
  prompt: string | null;
  tracks_json: string;
  view_count: number;
  revoked_at: number | null;
  created_at: number;
}

const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const TOKEN_LENGTH = 10;

/**
 * Unguessable token — the share URL is the only thing protecting a snapshot,
 * so it comes from the CSPRNG, not Math.random. Rejection sampling keeps the
 * alphabet uniform (256 % 62 != 0, so raw modulo would bias the early chars).
 */
export function generateShareToken(): string {
  const out: string[] = [];
  const limit = 256 - (256 % TOKEN_ALPHABET.length);
  while (out.length < TOKEN_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH));
    for (const byte of bytes) {
      if (byte >= limit) continue;
      out.push(TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length]!);
      if (out.length === TOKEN_LENGTH) break;
    }
  }
  return out.join("");
}

function parseTracks(json: string): Track[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as Track[]) : [];
  } catch {
    return [];
  }
}

function toSnapshot(row: ShareRow): ShareSnapshot {
  return {
    token: row.token,
    ownerChatId: row.owner_chat_id,
    sourceKind: row.source_kind as ShareSourceKind,
    sourceId: row.source_id,
    name: row.name,
    prompt: row.prompt,
    tracks: parseTracks(row.tracks_json),
    viewCount: row.view_count,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

/**
 * Idempotent per (owner, source): a live share for the same source is returned
 * as-is rather than replaced, so a link already sent into a chat keeps working
 * and keeps its view count.
 */
export function publishShare(db: AppDb, ownerChatId: number, input: ShareInput): ShareSnapshot {
  const existing = db
    .query<ShareRow, [number, string, number]>(
      `SELECT * FROM playlist_shares
       WHERE owner_chat_id = ? AND source_kind = ? AND source_id = ? AND revoked_at IS NULL`,
    )
    .get(ownerChatId, input.sourceKind, input.sourceId);
  if (existing) return toSnapshot(existing);

  const token = generateShareToken();
  db.query(
    `INSERT INTO playlist_shares (token, owner_chat_id, source_kind, source_id, name, prompt, tracks_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    token,
    ownerChatId,
    input.sourceKind,
    input.sourceId,
    input.name,
    input.prompt,
    JSON.stringify(input.tracks),
  );
  return getShare(db, token)!;
}

export function getShare(db: AppDb, token: string): ShareSnapshot | null {
  const row = db.query<ShareRow, [string]>(`SELECT * FROM playlist_shares WHERE token = ?`).get(token);
  return row ? toSnapshot(row) : null;
}

export function revokeShare(db: AppDb, ownerChatId: number, token: string): boolean {
  const info = db
    .query(
      `UPDATE playlist_shares SET revoked_at = unixepoch()
       WHERE token = ? AND owner_chat_id = ? AND revoked_at IS NULL`,
    )
    .run(token, ownerChatId);
  return info.changes > 0;
}

export function listShares(db: AppDb, ownerChatId: number): ShareSnapshot[] {
  return db
    .query<ShareRow, [number]>(
      `SELECT * FROM playlist_shares WHERE owner_chat_id = ? AND revoked_at IS NULL ORDER BY created_at DESC`,
    )
    .all(ownerChatId)
    .map(toSnapshot);
}

/**
 * One row per (token, viewer) so reopening a link never inflates the counter,
 * and the owner previewing their own share is not a view at all.
 */
export function recordShareView(db: AppDb, token: string, viewerChatId: number): void {
  const share = getShare(db, token);
  if (!share || share.ownerChatId === viewerChatId) return;
  const info = db
    .query(`INSERT INTO playlist_share_views (token, viewer_chat_id) VALUES (?, ?) ON CONFLICT DO NOTHING`)
    .run(token, viewerChatId);
  if (info.changes > 0) {
    db.query(`UPDATE playlist_shares SET view_count = view_count + 1 WHERE token = ?`).run(token);
  }
}
