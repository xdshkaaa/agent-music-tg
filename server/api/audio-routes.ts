import { Hono } from "hono";
import type { AppDb } from "../db";
import type { AppEnv } from "./context";
import { hasAccess } from "../access/entitlements";
import { isValidTrackUri, type Extractor } from "../audio/extractor";
import { processDownload, type AudioSender } from "../audio/deliver";
import type { StreamCache } from "../audio/stream-cache";
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
  streamCache: StreamCache;
}

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

    let path: string;
    try {
      path = await deps.streamCache.getFile(uri);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }

    const file = Bun.file(path);
    const size = file.size;
    const headers: Record<string, string> = {
      "Content-Type": "audio/mpeg",
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    };

    const range = c.req.header("Range");
    const match = range?.match(/^bytes=(\d*)-(\d*)$/);
    if (match && (match[1] || match[2])) {
      const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
      const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      }
      return new Response(file.slice(start, end + 1), {
        status: 206,
        headers: {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Length": String(end - start + 1),
        },
      });
    }

    return new Response(file, { status: 200, headers: { ...headers, "Content-Length": String(size) } });
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
