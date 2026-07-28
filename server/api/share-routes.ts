import { Hono } from "hono";
import type { AppDb } from "../db";
import type { AppEnv } from "./context";
import { env } from "../env";
import { publishShare, getShare, revokeShare, listShares, recordShareView } from "../access/shares-store";
import { buildShareUrl } from "../access/share-link";
import { getGeneration } from "../access/generations-store";
import { getPlaylist } from "../access/playlists-store";
import { getUser } from "../access/users-store";
import type { Track } from "../music/types";

let cachedBotUsername: string | null = null;

async function botUsername(): Promise<string> {
  if (cachedBotUsername) return cachedBotUsername;
  const res = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/getMe`);
  const data = (await res.json()) as { ok: boolean; result?: { username: string } };
  cachedBotUsername = data.result?.username ?? "";
  return cachedBotUsername;
}

/**
 * Reading a share is mounted separately, ahead of the allowlist gate — see
 * requireAuthAllowUnlisted. Everything that writes stays behind normal auth.
 */
export function createPublicShareRoutes(db: AppDb): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/shares/:token", (c) => {
    const chatId = c.get("chatId");
    const token = c.req.param("token");
    const share = getShare(db, token);
    if (!share) return c.json({ error: "not found" }, 404);
    if (share.revokedAt !== null) return c.json({ error: "revoked" }, 410);

    recordShareView(db, token, chatId);
    const fresh = getShare(db, token)!;
    const owner = getUser(db, share.ownerChatId);
    return c.json({
      token: fresh.token,
      name: fresh.name,
      prompt: fresh.prompt,
      tracks: fresh.tracks,
      author: { name: owner?.firstName ?? owner?.username ?? null },
      isOwner: chatId === share.ownerChatId,
      viewCount: fresh.viewCount,
      createdAt: fresh.createdAt,
    });
  });

  return app;
}

export function createShareRoutes(db: AppDb): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/shares", (c) => {
    return c.json({ shares: listShares(db, c.get("chatId")) });
  });

  app.post("/shares", async (c) => {
    const chatId = c.get("chatId");
    const body = await c.req.json().catch(() => null);
    const kind = body?.kind === "generation" || body?.kind === "playlist" ? body.kind : null;
    const id = Number(body?.id);
    if (!kind || !Number.isInteger(id)) return c.json({ error: "invalid source" }, 400);

    // Ownership is enforced by the store getters themselves: both take chatId
    // and return null for anyone else's row, so a foreign id is a 404 and never
    // leaks whether it exists.
    let name: string;
    let prompt: string | null;
    let tracks: Track[];
    if (kind === "generation") {
      const generation = getGeneration(db, chatId, id);
      if (!generation) return c.json({ error: "not found" }, 404);
      name = generation.playlistName ?? generation.prompt.slice(0, 100);
      prompt = generation.prompt;
      tracks = generation.tracks;
    } else {
      const playlist = getPlaylist(db, chatId, id);
      if (!playlist) return c.json({ error: "not found" }, 404);
      name = playlist.name;
      prompt = null;
      tracks = playlist.tracks.map((t) => ({
        uri: t.uri,
        title: t.title,
        artist: t.artist,
        ...(t.artwork ? { artwork: t.artwork } : {}),
      }));
    }
    if (tracks.length === 0) return c.json({ error: "empty playlist" }, 400);

    const share = publishShare(db, chatId, { sourceKind: kind, sourceId: id, name, prompt, tracks });
    const username = await botUsername();
    return c.json({ token: share.token, url: buildShareUrl(username, share.token), viewCount: share.viewCount });
  });

  app.delete("/shares/:token", (c) => {
    const ok = revokeShare(db, c.get("chatId"), c.req.param("token"));
    if (!ok) return c.json({ error: "forbidden" }, 403);
    return c.json({ ok: true });
  });

  return app;
}
