import { Hono } from "hono";
import type { AppDb } from "../db";
import type { AppEnv } from "./context";
import { hasAccess } from "../access/entitlements";
import { ownsTrack } from "../access/track-ownership";
import { streamRateLimiter } from "../lib/rate-limit";
import { isValidTrackUri, type Extractor } from "../audio/extractor";
import { processDownload, type AudioSender } from "../audio/deliver";
import type { StreamResolver } from "../audio/stream-resolver";
import { verificationStore } from "../audio/track-verification";
import { alternateFinder, type AlternateFinder, type TrackMeta } from "../audio/alternate-source";
import { clearAlternate, getAlternate, setAlternate } from "../audio/alternates-store";
import { lookupTrackMeta } from "../audio/track-meta";
import {
  deleteDownload,
  getDownload,
  hasActiveDownload,
  insertDownload,
  listDownloads,
} from "../audio/downloads-store";

export interface AudioDeps {
  sender: AudioSender;
  extractor: Extractor;
  scratchDir: string;
  streamResolver: StreamResolver;
  streamFetch?: StreamFetch;
  /** Cross-platform repair for unplayable tracks; defaults to the real search. */
  alternateFinder?: AlternateFinder;
}

type StreamFetch = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => ReturnType<typeof fetch>;

interface DownloadBody {
  playlistName?: string;
  tracks?: { uri?: string; title?: string; artist?: string; durationMs?: number; artwork?: string }[];
}

const MAX_TRACKS = 50;

function parseTracks(
  body: DownloadBody,
): { uri: string; title: string; artist: string; durationMs?: number; artwork?: string }[] | null {
  if (!Array.isArray(body.tracks) || body.tracks.length === 0 || body.tracks.length > MAX_TRACKS) return null;
  const tracks = [];
  for (const t of body.tracks) {
    if (typeof t?.uri !== "string" || !isValidTrackUri(t.uri)) return null;
    tracks.push({
      uri: t.uri,
      title: typeof t.title === "string" ? t.title : t.uri,
      artist: typeof t.artist === "string" ? t.artist : "",
      durationMs: typeof t.durationMs === "number" ? t.durationMs : undefined,
      artwork: typeof t.artwork === "string" ? t.artwork : undefined,
    });
  }
  return tracks;
}

const MAX_META_LEN = 200;

/**
 * Track metadata the player sends along with a stream request, used to find
 * the song on another platform when its own source has no audio. Untrusted
 * free text — it only ever becomes a search query.
 */
function metaFromQuery(title?: string, artist?: string, duration?: string): TrackMeta | null {
  const cleanTitle = (title ?? "").trim().slice(0, MAX_META_LEN);
  if (!cleanTitle) return null;
  const durationMs = Number(duration);
  return {
    title: cleanTitle,
    artist: (artist ?? "").trim().slice(0, MAX_META_LEN),
    durationMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : undefined,
  };
}

/**
 * Download-to-chat, history and streaming routes. Mounted inside the
 * requireAuth-protected /api app (see routes.ts), so every handler already
 * has a verified chatId.
 */
export function createAudioRoutes(db: AppDb, deps: AudioDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  function startJob(chatId: number, playlistName: string, tracks: Parameters<typeof insertDownload>[3]) {
    const record = insertDownload(db, chatId, playlistName, tracks);
    // Fire-and-forget: delivery takes minutes for a full playlist. Failures
    // are persisted per-track and summarized to the chat by processDownload.
    void processDownload(db, record, deps).catch((e) => {
      console.error(`download job ${record.id} crashed:`, e);
    });
    return record;
  }

  app.post("/download", async (c) => {
    const chatId = c.get("chatId");
    if (!hasAccess(db, chatId)) return c.json({ error: "нет доступа, пополните баланс" }, 403);
    if (hasActiveDownload(db, chatId)) return c.json({ error: "загрузка уже идёт, дождитесь завершения" }, 409);

    let body: DownloadBody;
    try {
      body = (await c.req.raw.json()) as DownloadBody;
    } catch {
      return c.json({ error: "invalid body" }, 400);
    }
    const playlistName = typeof body.playlistName === "string" && body.playlistName.trim() ? body.playlistName.trim() : "Плейлист";
    const tracks = parseTracks(body);
    if (!tracks) return c.json({ error: "tracks must be 1–50 items with valid uris" }, 400);

    const record = startJob(chatId, playlistName, tracks);
    return c.json({ downloadId: record.id }, 202);
  });

  app.get("/downloads", (c) => {
    return c.json({ downloads: listDownloads(db, c.get("chatId")) });
  });

  app.post("/downloads/:id/resend", (c) => {
    const chatId = c.get("chatId");
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "invalid id" }, 400);
    const record = getDownload(db, chatId, id);
    if (!record) return c.json({ error: "not found" }, 404);
    if (hasActiveDownload(db, chatId)) return c.json({ error: "загрузка уже идёт, дождитесь завершения" }, 409);

    // Re-send as a fresh job over the same tracks: cached file_ids make this
    // near-instant; previously failed tracks get another attempt.
    const fresh = startJob(chatId, record.playlistName, record.tracks.map(({ uri, title, artist, durationMs, artwork }) => ({ uri, title, artist, durationMs, artwork })));
    return c.json({ downloadId: fresh.id }, 202);
  });

  app.delete("/downloads/:id", (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "invalid id" }, 400);
    const deleted = deleteDownload(db, c.get("chatId"), id);
    if (!deleted) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  app.get("/stream/:uri", async (c) => {
    const uri = c.req.param("uri");
    if (!isValidTrackUri(uri)) return c.json({ error: "invalid uri" }, 400);

    const chatId = c.get("chatId");
    // Tracks already in the user's library stay playable forever; anything else
    // needs live entitlement, matching the gate on POST /download. Same boolean
    // either way, but hasAccess is one indexed row read while ownsTrack scans
    // the chat's generations with json_each — and this route is re-entered for
    // every Range seek, so the cheap arm has to go first.
    if (!hasAccess(db, chatId) && !ownsTrack(db, chatId, uri)) {
      return c.json({ error: "нет доступа, пополните баланс" }, 403);
    }
    // The limiter exists to bound yt-dlp spawns, so only a resolve that will
    // actually spawn one may cost budget. Charging cached tracks meant seeking
    // around inside a couple of songs could spend the whole per-minute budget
    // and 429 a user who never triggered a single subprocess.
    // A track whose own source went dead is served from the other platform
    // (see the fallback below). That substitution is remembered, so from the
    // second play on this route never touches the failing source again.
    const knownAlternate = getAlternate(db, uri);
    const primaryUri = knownAlternate ?? uri;

    const alreadyResolved = deps.streamResolver.isCached?.(primaryUri) ?? false;
    if (!alreadyResolved && streamRateLimiter.check(chatId)) {
      return c.json({ error: "too many requests" }, 429);
    }

    const range = c.req.header("Range");
    const signal = c.req.raw.signal;

    const primary = await attemptStream(primaryUri, range, signal);
    if (primary.ok) return primary.response;
    // The listener already left (skip, close, next track) — nothing to repair.
    if (signal.aborted) return c.json({ error: "stream aborted" }, 502);
    // Swapping sources only makes sense at the start of a file: answering a
    // seek into the middle of track A with bytes from track B hands the audio
    // element a spliced file. Failing here instead makes the player restart the
    // track, and that request — offset 0 — gets the substitute cleanly.
    if (range && !range.startsWith("bytes=0-")) {
      return c.json({ error: "stream unavailable" }, 502);
    }

    const failed = [primaryUri];
    if (knownAlternate) {
      // The remembered substitute died too: forget it and give the track's own
      // source another chance before searching again.
      clearAlternate(db, uri);
      const original = await attemptStream(uri, range, signal);
      if (original.ok) return original.response;
      failed.push(uri);
    }

    // The player sends what it is displaying; the DB fills in for older
    // clients, and supplies a duration to sanity-check candidates against
    // even when the client had none.
    let meta = metaFromQuery(c.req.query("title"), c.req.query("artist"), c.req.query("duration"));
    if (!meta || meta.durationMs == null) {
      const stored = lookupTrackMeta(db, chatId, uri);
      meta = meta ? { ...meta, durationMs: stored?.durationMs } : stored;
    }
    if (meta) {
      const finder = deps.alternateFinder ?? alternateFinder;
      const altUri = await finder.find(uri, meta, { exclude: failed });
      if (altUri) {
        const alternate = await attemptStream(altUri, range, signal);
        if (alternate.ok) {
          setAlternate(db, uri, altUri, meta);
          console.info(`[stream] ${uri} unplayable, serving ${altUri} instead`);
          return alternate.response;
        }
      }
    }
    return c.json({ error: "stream unavailable" }, 502);
  });

  type StreamAttempt = { ok: true; response: Response } | { ok: false };

  /**
   * One source's worth of proxying: resolve, fetch, hand the bytes back. Never
   * throws and never reports its own failure to the client — the caller decides
   * whether a failure becomes a fallback search or a 502.
   */
  async function attemptStream(uri: string, range: string | undefined, signal: AbortSignal): Promise<StreamAttempt> {
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const resolved = await deps.streamResolver.resolve(uri);
        const requestHeaders = new Headers(resolved.headers);
        if (range) requestHeaders.set("Range", range);
        // Forward the client's abort: when a listener skips a track or closes
        // the app mid-buffer, the upstream transfer should stop with them
        // instead of streaming the rest of the file into a dead socket.
        const upstream = await (deps.streamFetch ?? fetch)(resolved.url, {
          headers: requestHeaders,
          redirect: "follow",
          signal,
        });
        if (attempt === 0 && (upstream.status === 403 || upstream.status === 410)) {
          await upstream.body?.cancel();
          deps.streamResolver.invalidate(uri);
          continue;
        }
        if (upstream.status === 416) {
          const contentRange = upstream.headers.get("Content-Range");
          return {
            ok: true,
            response: new Response(null, {
              status: 416,
              headers: contentRange ? { "Content-Range": contentRange } : undefined,
            }),
          };
        }
        if (!upstream.ok) {
          await upstream.body?.cancel();
          console.error(`[stream] ${uri} upstream audio failed: ${upstream.status}`);
          return { ok: false };
        }
        const headers = new Headers();
        for (const name of ["Content-Type", "Content-Length", "Accept-Ranges", "Content-Range"]) {
          const value = upstream.headers.get(name);
          if (value !== null) headers.set(name, value);
        }
        headers.set("Cache-Control", "private, max-age=3600");
        return { ok: true, response: new Response(upstream.body, { status: upstream.status, headers }) };
      }
      return { ok: false };
    } catch (e) {
      // yt-dlp stderr carries filesystem paths and upstream URLs — log it,
      // don't hand it to the client.
      console.error(`[stream] ${uri}`, e);
      return { ok: false };
    }
  }

  app.get("/tracks/verify", async (c) => {
    const urisParam = c.req.query("uris");
    if (!urisParam) return c.json({ error: "missing uris query param" }, 400);
    const uris = urisParam.split(",").filter(Boolean);
    if (uris.length === 0) return c.json({ error: "empty uris" }, 400);
    const snapshot = verificationStore.getSnapshot(uris);
    return c.json(snapshot);
  });

  return app;
}
