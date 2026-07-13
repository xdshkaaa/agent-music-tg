import { randomBytes, createHash } from "node:crypto";
import { Hono } from "hono";
import type { AppDb } from "../db";
import { env } from "../env";
import { SPOTIFY_SCOPES } from "./types";
import { isAllowed } from "../lib/access-control";
import { storeTokens } from "./tokens";

const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const STATE_TTL_MS = 10 * 60_000;

export function redirectUri(): string {
  return `${env.publicOrigin}/spotify/callback`;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/**
 * Builds the per-chat Spotify authorize URL. Called from the bot's /link
 * command (or the Mini App's "connect Spotify" action) — the chat must
 * already be on the allowlist, checked upstream by the bot/API auth gate.
 */
export function startSpotifyLink(db: AppDb, chatId: number): string {
  if (!isAllowed(db, chatId)) {
    throw new Error(`chat ${chatId} is not allowed to link Spotify`);
  }
  const { verifier, challenge } = generatePkce();
  const state = base64url(randomBytes(16));

  db.query(
    `INSERT INTO oauth_state (state, chat_id, code_verifier, expires_at) VALUES (?, ?, ?, ?)`
  ).run(state, chatId, verifier, Date.now() + STATE_TTL_MS);

  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", env.spotifyClientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("scope", SPOTIFY_SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

interface PendingState {
  chat_id: number;
  code_verifier: string;
  expires_at: number;
}

export function createSpotifyOAuthRoutes(db: AppDb): Hono {
  const app = new Hono();

  app.get("/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");

    if (error) {
      return c.html(`<p>Spotify auth failed: ${error}. You can close this tab.</p>`, 200);
    }
    if (!code || !state) {
      return c.html(`<p>Missing code/state.</p>`, 400);
    }

    const pending = db
      .query<PendingState, [string]>(
        `SELECT chat_id, code_verifier, expires_at FROM oauth_state WHERE state = ?`
      )
      .get(state);
    // Single-use regardless of outcome — prevents replay of a captured callback URL.
    db.query(`DELETE FROM oauth_state WHERE state = ?`).run(state);

    if (!pending || pending.expires_at < Date.now()) {
      return c.html(`<p>This link expired or was already used. Run /link again in the bot.</p>`, 400);
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: env.spotifyClientId,
      code_verifier: pending.code_verifier,
    });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      return c.html(`<p>Token exchange failed (${res.status}). Run /link again in the bot.</p>`, 502);
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope?: string;
    };

    storeTokens(db, pending.chat_id, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      scope: data.scope ?? SPOTIFY_SCOPES,
    });

    return c.html(`<p>Spotify connected. You can close this tab and go back to Telegram.</p>`);
  });

  return app;
}
