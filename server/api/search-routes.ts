import { Hono } from "hono";
import type { AppDb } from "../db";
import type { AppContext, AppEnv } from "./context";
import { getActiveBackendId } from "../lib/settings";
import { isMusicBackend, createMusicProvider } from "../music/registry";
import type { MusicProvider } from "../music/types";
import { DEFAULT_BACKEND } from "./shared";

// Simple per-chat throttle for the free-text search endpoints (no LLM/credit
// gate, so they need their own guard against backend-scraping abuse).
const SEARCH_RATE_LIMIT = 20;
const SEARCH_RATE_WINDOW_MS = 60_000;
const SEARCH_HITS_MAX_CHATS = 5_000;
const searchHits = new Map<number, number[]>();

function isSearchRateLimited(chatId: number): boolean {
  const now = Date.now();
  const hits = (searchHits.get(chatId) ?? []).filter((t) => now - t < SEARCH_RATE_WINDOW_MS);
  if (hits.length === 0) {
    // Chat has no recent activity — evict it instead of leaving a stale empty
    // entry, so the map stays bounded by active chats, not lifetime chats seen.
    searchHits.delete(chatId);
  } else {
    searchHits.set(chatId, hits);
  }
  if (hits.length >= SEARCH_RATE_LIMIT) {
    return true;
  }
  if (searchHits.size >= SEARCH_HITS_MAX_CHATS) {
    // Defensive cap against unbounded growth under sustained abuse from many
    // distinct chat IDs; evict the oldest-inserted entry (Map preserves order).
    const oldestKey = searchHits.keys().next().value;
    if (oldestKey !== undefined) searchHits.delete(oldestKey);
  }
  hits.push(now);
  searchHits.set(chatId, hits);
  return false;
}

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
  if (isSearchRateLimited(c.get("chatId"))) {
    return c.json({ error: "too many requests" }, 429);
  }
  const backendId = getActiveBackendId(db, DEFAULT_BACKEND);
  const music = createMusicProvider(isMusicBackend(backendId) ? backendId : DEFAULT_BACKEND);
  return handler(music);
}

/** Plain (non-AI) search: tracks, artists, albums. */
export function createSearchRoutes(db: AppDb): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/search", async (c) => {
    const q = (c.req.query("q") ?? "").trim().slice(0, 200);
    if (!q) {
      return c.json({ error: "q is required" }, 400);
    }
    return withSearchGuard(db, c, async (music) => {
      const limit = Math.min(Math.max(Number(c.req.query("limit")) || 20, 1), 30);
      try {
        const tracks = await music.searchTracks(q, limit);
        let artists: Awaited<ReturnType<typeof music.searchArtists>> = [];
        try {
          artists = await music.searchArtists(q, 5);
        } catch (e) {
          console.error("[search/artists]", e);
        }
        return c.json({ tracks, artists });
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
        const [topTracks, albums] = await Promise.all([
          music.getArtistTopTracks(artistId, 10).catch((e: unknown) => {
            console.error("[artist/topTracks]", e);
            return [];
          }),
          music.getArtistAlbums(artistId, 10).catch((e: unknown) => {
            console.error("[artist/albums]", e);
            return [];
          }),
        ]);
        const artwork = topTracks[0]?.artwork ?? albums[0]?.artwork;
        return c.json({ id: artistId, name: artistName || topTracks[0]?.artist || "", artwork, topTracks, albums });
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
