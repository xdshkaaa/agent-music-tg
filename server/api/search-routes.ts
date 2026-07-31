import { Hono } from "hono";
import type { AppDb } from "../db";
import type { AppContext, AppEnv } from "./context";
import { getActiveBackendId } from "../lib/settings";
import { isMusicBackend, createMusicProvider } from "../music/registry";
import type { MusicProvider } from "../music/types";
import { DEFAULT_BACKEND } from "./shared";
import { searchRateLimiter } from "../lib/rate-limit";
import type { AudioDeps } from "./audio-routes";
import { enqueueWarmTracks } from "../audio/warm-queue";
import { env } from "../env";

/**
 * Shared guard for every plain-search endpoint: rate-limits the caller, then
 * resolves the active music backend and hands the provider to `handler`.
 * Returns the rate-limit 429 response directly when the guard trips.
 */
async function withSearchGuard(
  db: AppDb,
  c: AppContext,
  handler: (music: MusicProvider) => Promise<Response>,
): Promise<Response> {
  if (searchRateLimiter.check(c.get("chatId"))) {
    return c.json({ error: "too many requests" }, 429);
  }
  const backendId = getActiveBackendId(db, DEFAULT_BACKEND);
  const music = createMusicProvider(isMusicBackend(backendId) ? backendId : DEFAULT_BACKEND);
  return handler(music);
}

/** Plain (non-AI) search: tracks, artists, albums. */
export function createSearchRoutes(db: AppDb, audio?: AudioDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/search", async (c) => {
    const q = (c.req.query("q") ?? "").trim().slice(0, 200);
    if (!q) {
      return c.json({ error: "q is required" }, 400);
    }
    return withSearchGuard(db, c, async (music) => {
      const limit = Math.min(Math.max(Number(c.req.query("limit")) || 20, 1), 30);
      try {
        // Two independent upstream round-trips: awaiting them in sequence made
        // every search cost their sum instead of the slower one.
        const [tracks, artists] = await Promise.all([
          music.searchTracks(q, limit),
          music.searchArtists(q, 5).catch((e: unknown) => {
            console.error("[search/artists]", e);
            return [] as Awaited<ReturnType<typeof music.searchArtists>>;
          }),
        ]);
        const response = c.json({ tracks, artists });
        if (audio) enqueueWarmTracks(db, tracks, audio, env.audioStorageChatId, 1);
        return response;
      } catch (e) {
        console.error("[search]", e);
        return c.json({ error: "search failed" }, 502);
      }
    });
  });

  // Resolves an artist page: by id (from a search card) or by name (from the
  // player's artist-name tap, which only has a display string on hand).
  app.get("/artist", async (c) => {
    const id = (c.req.query("id") ?? "").trim();
    const name = (c.req.query("name") ?? "").trim().slice(0, 200);
    if (!id && !name) return c.json({ error: "id or name is required" }, 400);
    return withSearchGuard(db, c, async (music) => {
      try {
        let artistId = id;
        let artistName = name;
        if (!artistId) {
          const resolved = await music.searchArtist(name);
          if (!resolved) return c.json({ error: "artist not found" }, 404);
          artistId = resolved.id;
          artistName = resolved.name;
        }
        const [topTracks, albums, details] = await Promise.all([
          music.getArtistTopTracks(artistId, 10).catch((e: unknown) => {
            console.error("[artist/topTracks]", e);
            return [];
          }),
          music.getArtistAlbums(artistId, 10).catch((e: unknown) => {
            console.error("[artist/albums]", e);
            return [];
          }),
          // Optional per backend, and best-effort: a failure here must not cost
          // the user the artist page, only its avatar/stats rows.
          music.getArtistDetails?.(artistId).catch((e: unknown) => {
            console.error("[artist/details]", e);
            return null;
          }) ?? null,
        ]);
        // Prefer the real artist avatar; fall back to borrowing a track/album cover.
        const artwork = details?.artwork ?? topTracks[0]?.artwork ?? albums[0]?.artwork;
        return c.json({
          id: artistId,
          name: artistName || details?.name || topTracks[0]?.artist || "",
          artwork,
          followers: details?.followers,
          description: details?.description,
          topTracks,
          albums,
        });
      } catch (e) {
        console.error("[artist]", e);
        return c.json({ error: "artist lookup failed" }, 502);
      }
    });
  });

  app.get("/search/albums", async (c) => {
    const q = (c.req.query("q") ?? "").trim().slice(0, 200);
    if (!q) {
      return c.json({ error: "q is required" }, 400);
    }
    return withSearchGuard(db, c, async (music) => {
      const limit = Math.min(Math.max(Number(c.req.query("limit")) || 20, 1), 30);
      try {
        const albums = await music.searchAlbums(q, limit);
        return c.json({ albums });
      } catch (e) {
        console.error("[search/albums]", e);
        return c.json({ error: "album search failed" }, 502);
      }
    });
  });

  // Returns the tracks for a resolved album (uri is `backend:id`).
  app.get("/search/album-tracks", async (c) => {
    const uri = (c.req.query("uri") ?? "").trim();
    if (!uri) {
      return c.json({ error: "uri is required" }, 400);
    }
    return withSearchGuard(db, c, async (music) => {
      const rawLimit = Number(c.req.query("limit")) || 30;
      const limit = Math.min(Math.max(rawLimit, 1), 50);
      let id = uri.includes(":") ? uri.split(":").slice(1).join(":") : uri;
      if (id.startsWith("album:")) id = id.slice("album:".length);
      try {
        const tracks = await music.getAlbumTracks(id, limit);
        return c.json({ tracks });
      } catch (e) {
        console.error("[search/album-tracks]", e);
        return c.json({ error: "album tracks failed" }, 502);
      }
    });
  });

  return app;
}
