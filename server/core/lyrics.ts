import type { AppDb } from "../db";

const LRCLIB_BASE = "https://lrclib.net/api";
const FOUND_TTL_SECONDS = 30 * 24 * 60 * 60;
const NOT_FOUND_TTL_SECONDS = 24 * 60 * 60;
const FETCH_TIMEOUT_MS = 8_000;

export interface SyncedLine {
  t: number;
  line: string;
}

export type LyricsResult =
  | { kind: "synced"; lines: SyncedLine[] }
  | { kind: "plain"; text: string }
  | { kind: "notFound" };

interface LrcLibTrack {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  instrumental?: boolean;
}

function cacheKey(artist: string, title: string): string {
  return `${artist.normalize("NFKD").toLowerCase().trim()}|${title.normalize("NFKD").toLowerCase().trim()}`;
}

/** Parses standard LRC `[mm:ss.xx]text` lines into timestamped entries. */
export function parseLrc(lrc: string): SyncedLine[] {
  const lines: SyncedLine[] = [];
  for (const raw of lrc.split("\n")) {
    const match = raw.match(/^\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\](.*)$/);
    if (!match) continue;
    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    const text = match[3]!.trim();
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) continue;
    lines.push({ t: minutes * 60 + seconds, line: text });
  }
  return lines.sort((a, b) => a.t - b.t);
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function toResult(track: LrcLibTrack): LyricsResult {
  if (track.syncedLyrics) {
    const lines = parseLrc(track.syncedLyrics);
    if (lines.length > 0) return { kind: "synced", lines };
  }
  if (track.plainLyrics) return { kind: "plain", text: track.plainLyrics };
  return { kind: "notFound" };
}

async function fetchFromLrcLib(artist: string, title: string, durationSec?: number): Promise<LyricsResult> {
  const params = new URLSearchParams({ artist_name: artist, track_name: title });
  if (durationSec) params.set("duration", String(Math.round(durationSec)));
  const exact = await fetchJson(`${LRCLIB_BASE}/get?${params.toString()}`);
  if (exact && (exact.syncedLyrics || exact.plainLyrics)) return toResult(exact);

  const searchParams = new URLSearchParams({ artist_name: artist, track_name: title });
  const results = await fetchJson(`${LRCLIB_BASE}/search?${searchParams.toString()}`);
  if (Array.isArray(results) && results.length > 0) return toResult(results[0]);

  return { kind: "notFound" };
}

function readCache(db: AppDb, key: string): LyricsResult | null {
  const row = db
    .query<{ synced_json: string | null; plain_text: string | null; not_found: number; created_at: number }, [string]>(
      `SELECT synced_json, plain_text, not_found, created_at FROM lyrics_cache WHERE cache_key = ?`,
    )
    .get(key);
  if (!row) return null;
  const ageSeconds = Math.floor(Date.now() / 1000) - row.created_at;
  const ttl = row.not_found ? NOT_FOUND_TTL_SECONDS : FOUND_TTL_SECONDS;
  if (ageSeconds > ttl) return null;
  if (row.not_found) return { kind: "notFound" };
  if (row.synced_json) return { kind: "synced", lines: JSON.parse(row.synced_json) };
  if (row.plain_text) return { kind: "plain", text: row.plain_text };
  return { kind: "notFound" };
}

function writeCache(db: AppDb, key: string, result: LyricsResult): void {
  const syncedJson = result.kind === "synced" ? JSON.stringify(result.lines) : null;
  const plainText = result.kind === "plain" ? result.text : null;
  const notFound = result.kind === "notFound" ? 1 : 0;
  db.query(
    `INSERT INTO lyrics_cache (cache_key, synced_json, plain_text, not_found, created_at) VALUES (?, ?, ?, ?, unixepoch())
     ON CONFLICT(cache_key) DO UPDATE SET synced_json = excluded.synced_json, plain_text = excluded.plain_text,
       not_found = excluded.not_found, created_at = excluded.created_at`,
  ).run(key, syncedJson, plainText, notFound);
}

export async function getLyrics(db: AppDb, artist: string, title: string, durationSec?: number): Promise<LyricsResult> {
  const key = cacheKey(artist, title);
  const cached = readCache(db, key);
  if (cached) return cached;
  const result = await fetchFromLrcLib(artist, title, durationSec);
  writeCache(db, key, result);
  return result;
}
