import { Hono } from "hono";
import type { AppDb } from "../db";
import type { AppEnv, ApiDeps } from "./context";
import {
  listPlaylists,
  createPlaylist,
  renamePlaylist,
  deletePlaylist,
  getPlaylist,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
  getPlaylistLimit,
  PlaylistLimitError,
  STARS_PER_SLOT,
} from "../access/playlists-store";

/** Playlist CRUD ("Музыка" section) plus the Stars invoice for extra slots. */
export function createPlaylistRoutes(db: AppDb, deps: ApiDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/playlists", (c) => {
    const chatId = c.get("chatId");
    return c.json({ playlists: listPlaylists(db, chatId), limit: getPlaylistLimit(db, chatId) });
  });

  app.post("/playlists", async (c) => {
    const chatId = c.get("chatId");
    const body = await c.req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 200) return c.json({ error: "invalid name" }, 400);
    try {
      const playlist = createPlaylist(db, chatId, name);
      return c.json({ playlist });
    } catch (e) {
      if (e instanceof PlaylistLimitError) {
        return c.json({ error: "limit", limit: e.limit, starsPrice: e.starsPrice }, 403);
      }
      throw e;
    }
  });

  app.get("/playlists/:id", (c) => {
    const chatId = c.get("chatId");
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "invalid id" }, 400);
    const playlist = getPlaylist(db, chatId, id);
    if (!playlist) return c.json({ error: "not found" }, 404);
    return c.json({ playlist });
  });

  app.patch("/playlists/:id", async (c) => {
    const chatId = c.get("chatId");
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "invalid id" }, 400);
    const body = await c.req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 200) return c.json({ error: "invalid name" }, 400);
    const ok = renamePlaylist(db, chatId, id, name);
    if (!ok) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  app.delete("/playlists/:id", (c) => {
    const chatId = c.get("chatId");
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "invalid id" }, 400);
    const ok = deletePlaylist(db, chatId, id);
    if (!ok) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  app.post("/playlists/:id/tracks", async (c) => {
    const chatId = c.get("chatId");
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "invalid id" }, 400);
    const body = await c.req.json().catch(() => null);
    const uri = typeof body?.uri === "string" ? body.uri.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const artist = typeof body?.artist === "string" ? body.artist.trim() : "";
    const artwork = typeof body?.artwork === "string" ? body.artwork : null;
    if (!uri || !title || !artist) return c.json({ error: "invalid track" }, 400);
    const result = addTrackToPlaylist(db, chatId, id, { uri, title, artist, artwork });
    if (result === "not_found") return c.json({ error: "not found" }, 404);
    return c.json({ ok: true, duplicate: result === "duplicate" });
  });

  app.delete("/playlists/:id/tracks/:uri", (c) => {
    const chatId = c.get("chatId");
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "invalid id" }, 400);
    const uri = decodeURIComponent(c.req.param("uri"));
    const ok = removeTrackFromPlaylist(db, chatId, id, uri);
    if (!ok) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  // Stars invoice for extra playlist slots — bot-issued XTR invoice link,
  // opened in the Mini App via WebApp.openInvoice. Fulfillment happens in the
  // bot's successful_payment handler (idempotent by charge id).
  app.post("/playlists/slots/invoice", async (c) => {
    const chatId = c.get("chatId");
    const body = await c.req.json().catch(() => null);
    const rawSlots = Number(body?.slots ?? 1);
    const slots = Number.isInteger(rawSlots) && rawSlots > 0 && rawSlots <= 20 ? rawSlots : 1;
    if (!deps.createStarsInvoiceLink) return c.json({ error: "stars payments unavailable" }, 503);
    try {
      const payload = `slots:${chatId}:${slots}:${crypto.randomUUID()}`;
      const payUrl = await deps.createStarsInvoiceLink({
        title: slots === 1 ? "Доп. слот для плейлиста" : `Доп. слоты для плейлистов (${slots})`,
        description: `+${slots} к лимиту плейлистов`,
        payload,
        starsAmount: slots * STARS_PER_SLOT,
      });
      return c.json({ payUrl });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  });

  return app;
}
