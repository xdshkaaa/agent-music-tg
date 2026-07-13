import type { AppDb } from "../db";
import { env } from "../env";
import type { SpotifyTokens } from "./types";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

export class SpotifyNotLinkedError extends Error {
  constructor(chatId: number) {
    super(`chat ${chatId} has not linked a Spotify account yet`);
  }
}

interface TokenRow {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
}

export function storeTokens(db: AppDb, chatId: number, tokens: SpotifyTokens): void {
  db.query(
    `INSERT INTO spotify_tokens (chat_id, access_token, refresh_token, expires_at, scope)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at,
       scope = excluded.scope`
  ).run(chatId, tokens.accessToken, tokens.refreshToken, tokens.expiresAt, tokens.scope);
}

export function hasLinkedSpotify(db: AppDb, chatId: number): boolean {
  return (
    db.query<{ chat_id: number }, [number]>(`SELECT chat_id FROM spotify_tokens WHERE chat_id = ?`).get(chatId) !==
    null
  );
}

export function clearTokens(db: AppDb, chatId: number): void {
  db.query(`DELETE FROM spotify_tokens WHERE chat_id = ?`).run(chatId);
}

/**
 * Returns a valid access token for the chat, refreshing it first if expired.
 * Throws SpotifyNotLinkedError if the chat never linked an account, and clears
 * stored tokens (forcing re-link) if the refresh token itself is rejected.
 */
export async function getValidAccessToken(db: AppDb, chatId: number): Promise<string> {
  const row = db
    .query<TokenRow, [number]>(
      `SELECT access_token, refresh_token, expires_at, scope FROM spotify_tokens WHERE chat_id = ?`
    )
    .get(chatId);
  if (!row) throw new SpotifyNotLinkedError(chatId);

  if (row.expires_at - EXPIRY_SAFETY_MARGIN_MS > Date.now()) {
    return row.access_token;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
    client_id: env.spotifyClientId,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    clearTokens(db, chatId);
    throw new SpotifyNotLinkedError(chatId);
  }

  const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
  storeTokens(db, chatId, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? row.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope ?? row.scope,
  });
  return data.access_token;
}
