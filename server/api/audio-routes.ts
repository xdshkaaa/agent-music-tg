import { Hono } from "hono";
import type { AppDb } from "../db";
import type { AppEnv } from "./context";
import { hasAccess } from "../access/entitlements";
import { isValidTrackUri, type Extractor } from "../audio/extractor";
import { processDownload, type AudioSender } from "../audio/deliver";
import type { StreamResolver } from "../audio/stream-resolver";
import { verificationStore } from "../audio/track-verification";
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

    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const resolved = await deps.streamResolver.resolve(uri);
        const requestHeaders = new Headers(resolved.headers);
        const range = c.req.header("Range");
        if (range) requestHeaders.set("Range", range);
        const upstream = await (deps.streamFetch ?? fetch)(resolved.url, { headers: requestHeaders, redirect: "follow" });
        if (attempt === 0 && (upstream.status === 403 || upstream.status === 410)) {
          await upstream.body?.cancel();
          deps.streamResolver.invalidate(uri);
          continue;
        }
        if (upstream.status === 416) {
          const contentRange = upstream.headers.get("Content-Range");
          return new Response(null, {
            status: 416,
            headers: contentRange ? { "Content-Range": contentRange } : undefined,
          });
        }
        if (!upstream.ok) return c.json({ error: `upstream audio failed: ${upstream.status}` }, 502);
        const headers = new Headers();
        for (const name of ["Content-Type", "Content-Length", "Accept-Ranges", "Content-Range"]) {
          const value = upstream.headers.get(name);
          if (value !== null) headers.set(name, value);
        }
        headers.set("Cache-Control", "private, max-age=3600");
        return new Response(upstream.body, { status: upstream.status, headers });
      }
      return c.json({ error: "upstream audio failed" }, 502);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  });

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
