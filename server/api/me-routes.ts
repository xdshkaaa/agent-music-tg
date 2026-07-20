import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AppDb } from "../db";
import type { AppEnv } from "./context";
import { env } from "../env";
import { isMusicBackend } from "../music/registry";
import { getUser, setPhotoFileId, setUserMusicBackend } from "../access/users-store";
import { getReferralStats } from "../access/referral-store";
import { getReferralSettings } from "../lib/settings";
import { countGenerations, saveGeneration, unsaveGeneration, listSavedGenerations, renameGeneration } from "../access/generations-store";
import { addSavedTrack, removeSavedTrack, listSavedTracks, isSavedTrack } from "../access/saved-tracks-store";
import { addDislike, removeDislike, isDisliked } from "../access/reactions-store";
import { listInvoicesForChat, getInvoiceById } from "../payments/invoices-store";
import { cancelInvoiceAndRefund } from "../payments/cancel";
import { getLyrics } from "../core/lyrics";
import { AVATAR_DIR, isAnimatedAvatar, getCachedAvatarRelPath, downloadToTemp, convertToStaticJpeg, cacheStaticAvatar } from "../avatar";
import { trialStatus } from "./shared";
import { recordDailyEvent } from "../analytics/store";

/** `/me`, avatars, generation history, saved tracks, lyrics, and player reactions. */
export function createMeRoutes(db: AppDb): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Resolving a photoUrl costs 1-2 Telegram round-trips (getFile, sometimes
  // getUserProfilePhotos too); /me is polled often, so cache the result per
  // chat for a few minutes instead of re-resolving on every call.
  const AVATAR_CACHE_TTL_MS = 5 * 60_000;
  const avatarCache = new Map<number, { url: string | null; at: number }>();

  // Fetch the user's current profile photo file_id from Telegram and persist
  // it, so avatars work even for users who never sent /start (or changed photo).
  async function fetchAndStorePhotoFileId(chatId: number): Promise<string | null> {
    const res = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/getUserProfilePhotos?user_id=${chatId}&limit=1`);
    const data = await res.json() as { ok: boolean; result?: { photos: { file_id: string }[][] } };
    const first = data.ok ? data.result?.photos?.[0] : undefined;
    const fileId = first && first.length > 0 ? first[first.length - 1]!.file_id : null;
    if (fileId) setPhotoFileId(db, chatId, fileId);
    return fileId;
  }

  /** Resolves the chat's current avatar URL, hitting Telegram at most once per TTL window. */
  async function resolvePhotoUrl(chatId: number, user: ReturnType<typeof getUser>): Promise<string | null> {
    const cached = avatarCache.get(chatId);
    if (cached && Date.now() - cached.at < AVATAR_CACHE_TTL_MS) return cached.url;

    let photoUrl: string | null = null;
    try {
      let fileId = user?.photoFileId ?? null;
      if (!fileId) {
        fileId = await fetchAndStorePhotoFileId(chatId);
      }
      if (fileId) {
        let res = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/getFile?file_id=${fileId}`);
        let data = await res.json() as { ok: boolean; result?: { file_path: string; file_unique_id: string } };
        if (!data.ok && user?.photoFileId) {
          // Stored file_id went stale (photo deleted/changed) — refresh it.
          fileId = await fetchAndStorePhotoFileId(chatId);
          if (fileId) {
            res = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/getFile?file_id=${fileId}`);
            data = await res.json() as { ok: boolean; result?: { file_path: string; file_unique_id: string } };
          }
        }
        if (data.ok && data.result?.file_path) {
          const { file_path, file_unique_id } = data.result;
          if (isAnimatedAvatar(file_path) && file_unique_id) {
            const cached2 = getCachedAvatarRelPath(file_unique_id);
            if (cached2) {
              photoUrl = `/avatar/${cached2}`;
            } else {
              const downloadUrl = `https://api.telegram.org/file/bot${env.telegramBotToken}/${file_path}`;
              const tmp = await downloadToTemp(downloadUrl);
              const converted = await convertToStaticJpeg(tmp, file_unique_id);
              if (converted) {
                photoUrl = `/avatar/${file_unique_id}.jpg`;
              }
            }
          } else if (file_unique_id) {
            const cached2 = getCachedAvatarRelPath(file_unique_id);
            if (cached2) {
              photoUrl = `/avatar/${cached2}`;
            } else {
              const downloadUrl = `https://api.telegram.org/file/bot${env.telegramBotToken}/${file_path}`;
              await cacheStaticAvatar(downloadUrl, file_unique_id);
              photoUrl = `/avatar/${file_unique_id}.jpg`;
            }
          }
        }
      }
    } catch { /* photoUrl stays null */ }
    avatarCache.set(chatId, { url: photoUrl, at: Date.now() });
    return photoUrl;
  }

  app.get("/me", async (c) => {
    const chatId = c.get("chatId");
    recordDailyEvent(db, chatId, "miniapp_opened");
    const user = getUser(db, chatId);
    const photoUrl = await resolvePhotoUrl(chatId, user);
    return c.json({
      chatId,
      isAdmin: c.get("isAdmin"),
      credits: user?.credits ?? 0,
      subscriptionUntil: user?.subscriptionUntil ?? null,
      trial: trialStatus(user),
      generationsUsed: countGenerations(db, chatId),
      photoUrl,
      musicBackend: user?.musicBackend ?? null,
      // Additive: present only when the bot previously recorded a @username
      // for this chat (via /start). Omitted (not null) when unknown, so the
      // MeResponse shape stays backward-compatible for older clients.
      ...(user?.username ? { username: user.username } : {}),
    });
  });

  // Per-user music provider override (null clears it back to the admin default).
  app.post("/me/music-backend", async (c) => {
    const body = await c.req.json().catch(() => null);
    const id = body?.id;
    if (id !== null && !isMusicBackend(id)) {
      return c.json({ error: "invalid backend id" }, 400);
    }
    setUserMusicBackend(db, c.get("chatId"), id);
    return c.json({ ok: true, musicBackend: id });
  });

  app.get("/avatar/:filename", async (c) => {
    const filename = c.req.param("filename");
    if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
      return c.json({ error: "not found" }, 404);
    }
    try {
      const buf = await readFile(path.join(AVATAR_DIR, filename));
      return c.newResponse(buf, 200, { "Content-Type": "image/jpeg" });
    } catch {
      return c.json({ error: "not found" }, 404);
    }
  });

  // --- Referral program ---------------------------------------------------

  let cachedBotUsername: string | null = null;
  async function botUsername(): Promise<string> {
    if (cachedBotUsername) return cachedBotUsername;
    const res = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/getMe`);
    const data = await res.json() as { ok: boolean; result?: { username: string } };
    cachedBotUsername = data.result?.username ?? "";
    return cachedBotUsername;
  }

  app.get("/referral", async (c) => {
    const chatId = c.get("chatId");
    const stats = getReferralStats(db, chatId);
    const settings = getReferralSettings(db);
    const username = await botUsername();
    return c.json({
      link: `https://t.me/${username}?start=ref_${chatId}`,
      invitedCount: stats.invitedCount,
      creditsEarned: stats.creditsEarned,
      rewardCredits: settings.rewardCredits,
      maxPerUser: settings.maxPerUser,
    });
  });

  app.get("/me/purchases", (c) => {
    return c.json({ purchases: listInvoicesForChat(db, c.get("chatId")) });
  });

  // Cancel a pending invoice from the Mini App (e.g. user backs out of the
  // СБП payment popup). Rolls back any held generation credits.
  app.post("/invoices/:id/cancel", (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "invalid id" }, 400);
    const invoice = getInvoiceById(db, id);
    if (!invoice || invoice.chatId !== c.get("chatId")) return c.json({ error: "not found" }, 404);
    const result = cancelInvoiceAndRefund(db, invoice.provider, invoice.externalId);
    return c.json({ canceled: result.canceled, refundedCredits: result.refundedCredits ?? 0 });
  });

  // --- Playlist history (opt-in) ----------------------------------------

  app.post("/generations/:id/save", (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "invalid id" }, 400);
    const ok = saveGeneration(db, c.get("chatId"), id);
    if (!ok) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  app.delete("/generations/:id/save", (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "invalid id" }, 400);
    const ok = unsaveGeneration(db, c.get("chatId"), id);
    if (!ok) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  app.patch("/generations/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "invalid id" }, 400);
    const body = await c.req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (name.length === 0 || name.length > 200) return c.json({ error: "invalid name" }, 400);
    const ok = renameGeneration(db, c.get("chatId"), id, name);
    if (!ok) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  app.get("/history", (c) => {
    return c.json({ history: listSavedGenerations(db, c.get("chatId")) });
  });

  // --- Saved tracks ("Плейлисты" tab) ------------------------------------

  app.get("/my-music", (c) => {
    return c.json({ tracks: listSavedTracks(db, c.get("chatId")) });
  });

  app.post("/my-music", async (c) => {
    const body = await c.req.json().catch(() => null);
    const uri = typeof body?.uri === "string" ? body.uri.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const artist = typeof body?.artist === "string" ? body.artist.trim() : "";
    const artwork = typeof body?.artwork === "string" ? body.artwork : null;
    if (!uri || !title || !artist) return c.json({ error: "invalid track" }, 400);
    addSavedTrack(db, c.get("chatId"), { uri, title, artist, artwork });
    return c.json({ ok: true });
  });

  app.delete("/my-music/:uri", (c) => {
    const uri = decodeURIComponent(c.req.param("uri"));
    const ok = removeSavedTrack(db, c.get("chatId"), uri);
    if (!ok) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  // --- Lyrics (LRCLIB, server-cached) ------------------------------------

  app.get("/lyrics", async (c) => {
    const artist = (c.req.query("artist") ?? "").trim().slice(0, 200);
    const title = (c.req.query("title") ?? "").trim().slice(0, 200);
    if (!artist || !title) return c.json({ error: "artist and title are required" }, 400);
    const durationRaw = Number(c.req.query("duration"));
    const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : undefined;
    try {
      const result = await getLyrics(db, artist, title, duration);
      if (result.kind === "synced") return c.json({ status: "synced", lines: result.lines });
      if (result.kind === "plain") return c.json({ status: "plain", text: result.text });
      return c.json({ status: "notFound" });
    } catch (e) {
      console.error("[lyrics]", e);
      return c.json({ status: "notFound" });
    }
  });

  // --- Player reactions (dislike; like continues through /my-music) -----

  app.post("/reactions/dislike", async (c) => {
    const chatId = c.get("chatId");
    const body = await c.req.json().catch(() => null);
    const uri = typeof body?.uri === "string" ? body.uri.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const artist = typeof body?.artist === "string" ? body.artist.trim() : "";
    if (!uri || !title || !artist) return c.json({ error: "invalid track" }, 400);
    // Mutual exclusivity: disliking removes the track from Favorites first.
    removeSavedTrack(db, chatId, uri);
    addDislike(db, chatId, { uri, title, artist });
    return c.json({ ok: true });
  });

  // Combined like/dislike state for a track (player reaction buttons on open).
  app.get("/reactions/status", (c) => {
    const chatId = c.get("chatId");
    const uri = (c.req.query("uri") ?? "").trim();
    if (!uri) return c.json({ error: "uri is required" }, 400);
    return c.json({ liked: isSavedTrack(db, chatId, uri), disliked: isDisliked(db, chatId, uri) });
  });

  app.delete("/reactions/dislike/:uri", (c) => {
    const chatId = c.get("chatId");
    const uri = decodeURIComponent(c.req.param("uri"));
    const ok = removeDislike(db, chatId, uri);
    if (!ok) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  return app;
}
