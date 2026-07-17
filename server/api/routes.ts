import { Hono } from "hono";
import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import type { AppDb } from "../db";
import type { AppEnv } from "./context";
import { requireAuth, requireAdmin } from "./middleware";
import { AVAILABLE_PROVIDERS, isProviderId, getProviderDefaults } from "../agent/registry";
import { AVAILABLE_BACKENDS, isMusicBackend, createMusicProvider } from "../music/registry";
import {
  getActiveProviderId, setActiveProviderId,
  getActiveBackendId, setActiveBackendId,
  getProviderOverrides, setProviderOverrides,
  getPaymentsEnabled, setPaymentsEnabled,
  getOpenAccess, setOpenAccess,
  getAllSettings, setSettingValue, createSetting,
  getShopSettings, setShopSettings,
} from "../lib/settings";
import { getPendingClarify, setPendingClarify, clearSession } from "../bot/session";
import { startGeneration, resumeGeneration, extendGeneration } from "../core/run-generation";
import { getUser, upsertUser, listUsers, addCredits, extendSubscription, revokeSubscription, claimTrial, setPhotoFileId, setUserMusicBackend, type User } from "../access/users-store";
import { countGenerations, saveGeneration, unsaveGeneration, listSavedGenerations, renameGeneration } from "../access/generations-store";
import { trialActive } from "../access/entitlements";
import { env } from "../env";
import {
  listActiveOffers,
  listOffers,
  createOffer,
  updateOffer,
  deleteOffer,
  getOffer,
  type GrantKind,
} from "../payments/offers-store";
import { listInvoicesForChat, getInvoiceById } from "../payments/invoices-store";
import { cancelInvoiceAndRefund } from "../payments/cancel";
import { purchaseOffer, purchaseOfferRub, OfferUnavailableError, RubPriceMissingError } from "../payments/purchase";
import { UnsupportedAssetError, isSupportedAsset, SUPPORTED_ASSETS } from "../payments/crypto-pay";
import { plategaEnabled } from "../payments/platega";
import { getAdminStats } from "../admin/stats";
import { broadcast, type SendFn } from "../admin/broadcast";
import { getGrantHistoryForUser, getAllGrantHistory, countGrantHistory } from "../admin/grant-history";
import { getAllowlist, addToAllowlist, removeFromAllowlist, setChatAdminRole } from "../lib/access-control";
import { createAudioRoutes, type AudioDeps } from "./audio-routes";
import { AVATAR_DIR, isAnimatedAvatar, getCachedAvatarRelPath, downloadToTemp, convertToStaticJpeg } from "../avatar";
import { readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PROVIDER = "opencode";
const DEFAULT_BACKEND = "youtube-music";

// Simple per-chat throttle for the free-text search endpoint (no LLM/credit
// gate, so it needs its own guard against backend-scraping abuse).
const SEARCH_RATE_LIMIT = 20;
const SEARCH_RATE_WINDOW_MS = 60_000;
const searchHits = new Map<number, number[]>();

function isSearchRateLimited(chatId: number): boolean {
  const now = Date.now();
  const hits = (searchHits.get(chatId) ?? []).filter((t) => now - t < SEARCH_RATE_WINDOW_MS);
  if (hits.length >= SEARCH_RATE_LIMIT) {
    searchHits.set(chatId, hits);
    return true;
  }
  hits.push(now);
  searchHits.set(chatId, hits);
  return false;
}

export interface ApiDeps {
  /** Sends a Telegram message; enables admin broadcast from the Mini App. */
  send?: SendFn;
  /** Creates a Telegram Stars (XTR) invoice link; enables Stars purchases from the Mini App. */
  createStarsInvoiceLink?: (args: { title: string; description: string; payload: string; starsAmount: number }) => Promise<string>;
  /** Audio download-to-chat + streaming; absent in tests that don't exercise it. */
  audio?: AudioDeps;
}

/** Validates starsAmount is a positive integer. Returns the number or "invalid". */
function parseRequiredStarsAmount(v: unknown): number | "invalid" {
  if (v === undefined || v === null || v === "") return "invalid";
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : "invalid";
}

/** Validates starsAmount for partial updates. Returns null (clear), number (set), or "invalid". */
function parseOptionalStarsAmount(v: unknown): number | null | "invalid" {
  if (v === null || v === "" || v === 0) return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : "invalid";
}

/** Validates rubAmount (nullable). Returns null (clear), number (set), or "invalid". */
function parseOptionalRubAmount(v: unknown): number | null | "invalid" {
  if (v === undefined || v === null || v === "" || v === 0) return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : "invalid";
}

function parseIcon(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const s = String(v).trim();
  if (s.length > 200) return "invalid";
  return s;
}

function isGrantKind(v: unknown): v is GrantKind {
  return v === "credits" || v === "subscription";
}

/** Additive `/me` trial shape; older clients ignore it. */
function trialStatus(user: User | null): {
  claimed: boolean;
  active: boolean;
  creditsLeft: number;
  until: number | null;
} {
  return {
    claimed: user?.trialClaimedAt != null,
    active: trialActive(user),
    creditsLeft: user?.trialCredits ?? 0,
    until: user?.trialUntil ?? null,
  };
}

async function readJsonBody<T extends Record<string, unknown>>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    return {};
  }
}

/**
 * Last-resort SSE error handler: an unhandled exception inside a stream
 * callback must still deliver a terminal outcome frame, otherwise the Mini App
 * shows "stream ended without an outcome".
 */
async function sseErrorOutcome(e: Error, stream: SSEStreamingApi): Promise<void> {
  console.error("[generate stream]", e);
  try {
    await stream.writeSSE({
      data: JSON.stringify({
        type: "outcome",
        outcome: { status: "error", message: "Внутренняя ошибка сервера. Попробуйте ещё раз." },
      }),
    });
  } catch {
    // client already disconnected
  }
}

export function createApiRoutes(db: AppDb, deps: ApiDeps = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("*", requireAuth(db));

  // Record every authenticated caller as a known user (audience + stats).
  app.use("*", async (c, next) => {
    upsertUser(db, c.get("chatId"));
    await next();
  });

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

  app.get("/me", async (c) => {
    const user = getUser(db, c.get("chatId"));
    let photoUrl: string | null = null;
    try {
      let fileId = user?.photoFileId ?? null;
      if (!fileId) {
        fileId = await fetchAndStorePhotoFileId(c.get("chatId"));
      }
      if (fileId) {
        let res = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/getFile?file_id=${fileId}`);
        let data = await res.json() as { ok: boolean; result?: { file_path: string; file_unique_id: string } };
        if (!data.ok && user?.photoFileId) {
          // Stored file_id went stale (photo deleted/changed) — refresh it.
          fileId = await fetchAndStorePhotoFileId(c.get("chatId"));
          if (fileId) {
            res = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/getFile?file_id=${fileId}`);
            data = await res.json() as { ok: boolean; result?: { file_path: string; file_unique_id: string } };
          }
        }
        if (data.ok && data.result?.file_path) {
          const { file_path, file_unique_id } = data.result;
          if (isAnimatedAvatar(file_path) && file_unique_id) {
            const cached = getCachedAvatarRelPath(file_unique_id);
            if (cached) {
              photoUrl = `/avatar/${cached}`;
            } else {
              const downloadUrl = `https://api.telegram.org/file/bot${env.telegramBotToken}/${file_path}`;
              const tmp = await downloadToTemp(downloadUrl);
              const converted = await convertToStaticJpeg(tmp, file_unique_id);
              if (converted) {
                photoUrl = `/avatar/${file_unique_id}.jpg`;
              }
            }
          } else {
            photoUrl = `https://api.telegram.org/file/bot${env.telegramBotToken}/${file_path}`;
          }
        }
      }
    } catch { /* photoUrl stays null */ }
    return c.json({
      chatId: c.get("chatId"),
      isAdmin: c.get("isAdmin"),
      credits: user?.credits ?? 0,
      subscriptionUntil: user?.subscriptionUntil ?? null,
      trial: trialStatus(user),
      generationsUsed: countGenerations(db, c.get("chatId")),
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

  // --- Plain search (no AI agent) ---------------------------------------

  app.get("/search", async (c) => {
    const chatId = c.get("chatId");
    const q = (c.req.query("q") ?? "").trim().slice(0, 200);
    if (!q) {
      return c.json({ error: "q is required" }, 400);
    }
    if (isSearchRateLimited(chatId)) {
      return c.json({ error: "too many requests" }, 429);
    }
    const limit = Math.min(Math.max(Number(c.req.query("limit")) || 20, 1), 30);
    const backendId = getActiveBackendId(db, DEFAULT_BACKEND);
    const music = createMusicProvider(isMusicBackend(backendId) ? backendId : DEFAULT_BACKEND);
    try {
      const tracks = await music.searchTracks(q, limit);
      return c.json({ tracks });
    } catch (e) {
      console.error("[search]", e);
      return c.json({ error: "search failed" }, 502);
    }
  });

  app.get("/search/albums", async (c) => {
    const chatId = c.get("chatId");
    const q = (c.req.query("q") ?? "").trim().slice(0, 200);
    if (!q) {
      return c.json({ error: "q is required" }, 400);
    }
    if (isSearchRateLimited(chatId)) {
      return c.json({ error: "too many requests" }, 429);
    }
    const limit = Math.min(Math.max(Number(c.req.query("limit")) || 20, 1), 30);
    const backendId = getActiveBackendId(db, DEFAULT_BACKEND);
    const music = createMusicProvider(isMusicBackend(backendId) ? backendId : DEFAULT_BACKEND);
    try {
      const albums = await music.searchAlbums(q, limit);
      return c.json({ albums });
    } catch (e) {
      console.error("[search/albums]", e);
      return c.json({ error: "album search failed" }, 502);
    }
  });

  // Returns the tracks for a resolved album (uri is `backend:id`).
  app.get("/search/album-tracks", async (c) => {
    const chatId = c.get("chatId");
    const uri = (c.req.query("uri") ?? "").trim();
    if (!uri) {
      return c.json({ error: "uri is required" }, 400);
    }
    if (isSearchRateLimited(chatId)) {
      return c.json({ error: "too many requests" }, 429);
    }
    const rawLimit = Number(c.req.query("limit")) || 30;
    const limit = Math.min(Math.max(rawLimit, 1), 50);
    const backendId = getActiveBackendId(db, DEFAULT_BACKEND);
    const music = createMusicProvider(isMusicBackend(backendId) ? backendId : DEFAULT_BACKEND);
    const id = uri.includes(":") ? uri.split(":").slice(1).join(":") : uri;
    try {
      const tracks = await music.getAlbumTracks(id, limit);
      return c.json({ tracks });
    } catch (e) {
      console.error("[search/album-tracks]", e);
      return c.json({ error: "album tracks failed" }, 502);
    }
  });

  // --- Offers & purchase -----------------------------------------------

  // Free trial claim: instant grant, no invoice. Gated like /invoices — when
  // payments are off the paywall is bypassed, so a trial is meaningless.
  app.post("/trial/claim", (c) => {
    if (!getPaymentsEnabled(db, env.paymentsEnabled)) {
      return c.json({ error: "payments disabled" }, 503);
    }
    const chatId = c.get("chatId");
    if (!claimTrial(db, chatId)) {
      return c.json({ error: "trial already claimed" }, 409);
    }
    return c.json({ trial: trialStatus(getUser(db, chatId)) });
  });

  app.get("/offers", (c) => {
    return c.json({ offers: listActiveOffers(db) });
  });

  app.get("/shop-config", (c) => {
    const { headerIcon, headerTitle, supportContact } = getShopSettings(db);
    return c.json({ headerIcon, headerTitle, supportContact });
  });

  app.post("/invoices", async (c) => {
    if (!getPaymentsEnabled(db, env.paymentsEnabled)) {
      return c.json({ error: "payments disabled" }, 503);
    }
    const body = await readJsonBody<{ offerId: number; method?: string }>(c.req.raw);
    const offerId = Number(body.offerId);
    if (!Number.isFinite(offerId)) return c.json({ error: "offerId is required" }, 400);
    const method = body.method ?? "crypto";
    if (method !== "crypto" && method !== "stars" && method !== "platega") {
      return c.json({ error: "method must be crypto|stars|platega" }, 400);
    }

    if (method === "platega") {
      if (!plategaEnabled()) return c.json({ error: "platega payments unavailable" }, 503);
      const offer = getOffer(db, offerId);
      if (!offer || !offer.active) return c.json({ error: "offer is not available" }, 400);
      if (!offer.rubAmount) return c.json({ error: "offer has no RUB price" }, 400);
      try {
        const result = await purchaseOfferRub(db, c.get("chatId"), offerId);
        return c.json({ id: result.invoiceId, payUrl: result.payUrl, offerTitle: result.offerTitle, method: "platega" });
      } catch (e) {
        if (e instanceof OfferUnavailableError || e instanceof RubPriceMissingError) {
          return c.json({ error: e.message }, 400);
        }
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
      }
    }

    if (method === "stars") {
      const offer = getOffer(db, offerId);
      if (!offer || !offer.active) return c.json({ error: "offer is not available" }, 400);
      if (!offer.starsAmount) return c.json({ error: "offer has no Stars price" }, 400);
      if (!deps.createStarsInvoiceLink) return c.json({ error: "stars payments unavailable" }, 503);
      try {
        const payload = JSON.stringify({ chatId: c.get("chatId"), offerId: offer.id });
        const payUrl = await deps.createStarsInvoiceLink({
          title: offer.title,
          description: offer.title,
          payload,
          starsAmount: offer.starsAmount,
        });
        return c.json({ payUrl, method: "stars", offerTitle: offer.title });
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
      }
    }

    try {
      const result = await purchaseOffer(db, c.get("chatId"), offerId);
      return c.json({ id: result.invoiceId, payUrl: result.payUrl, offerTitle: result.offerTitle, method: "crypto" });
    } catch (e) {
      if (e instanceof OfferUnavailableError) return c.json({ error: e.message }, 400);
      if (e instanceof UnsupportedAssetError) {
        return c.json({ error: "crypto asset unsupported", asset: e.asset }, 400);
      }
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  });

  // --- Admin-only: active AI provider / music backend -----------------
  // Enforced by requireAdmin below, independent of whether the Mini App
  // renders this screen for the calling chat.

  app.get("/admin/settings", requireAdmin, (c) => {
    // Stored value may be a legacy/removed provider (e.g. "openrouter") — fall
    // back to the default rather than surfacing an id the dropdown can't render.
    const storedProvider = getActiveProviderId(db, DEFAULT_PROVIDER);
    return c.json({
      activeProvider: isProviderId(storedProvider) ? storedProvider : DEFAULT_PROVIDER,
      activeBackend: getActiveBackendId(db, DEFAULT_BACKEND),
      availableProviders: AVAILABLE_PROVIDERS,
      availableBackends: AVAILABLE_BACKENDS,
    });
  });

  app.post("/admin/settings/provider", requireAdmin, async (c) => {
    const body = await readJsonBody<{ id: string }>(c.req.raw);
    if (!body.id || !isProviderId(body.id)) {
      return c.json({ error: `id must be one of: ${AVAILABLE_PROVIDERS.join(", ")}` }, 400);
    }
    setActiveProviderId(db, body.id);
    return c.json({ activeProvider: body.id });
  });

  app.post("/admin/settings/backend", requireAdmin, async (c) => {
    const body = await readJsonBody<{ id: string }>(c.req.raw);
    if (!body.id || !isMusicBackend(body.id)) {
      return c.json({ error: `id must be one of: ${AVAILABLE_BACKENDS.join(", ")}` }, 400);
    }
    setActiveBackendId(db, body.id);
    return c.json({ activeBackend: body.id });
  });

  // --- Admin: stats, offers, broadcast, shop settings ------------------

  app.get("/admin/stats", requireAdmin, (c) => {
    const period = c.req.query("period");
    const valid = period === "today" || period === "week" || period === "month" || period === "all" ? period : "all";
    return c.json(getAdminStats(db, valid));
  });

  app.get("/admin/offers", requireAdmin, (c) => {
    return c.json({ offers: listOffers(db) });
  });

  app.post("/admin/offers", requireAdmin, async (c) => {
    const b = await readJsonBody<{
      title: string;
      amount: string;
      asset: string;
      starsAmount: number | null;
      rubAmount?: number | null;
      icon: string | null;
      active: boolean;
      grantKind: string;
      grantAmount: number;
    }>(c.req.raw);
    if (!b.title || !b.amount || !b.asset || !isGrantKind(b.grantKind) || !Number.isFinite(Number(b.grantAmount))) {
      return c.json({ error: "title, amount, asset, grantKind (credits|subscription), grantAmount are required" }, 400);
    }
    if (!isSupportedAsset(b.asset)) {
      return c.json(
        { error: `unsupported asset: ${String(b.asset).toUpperCase()}. Supported: ${SUPPORTED_ASSETS.join(", ")}` },
        400,
      );
    }
    const starsAmount = parseRequiredStarsAmount(b.starsAmount);
    if (starsAmount === "invalid") return c.json({ error: "starsAmount must be a positive integer" }, 400);
    const rubAmount = parseOptionalRubAmount(b.rubAmount);
    if (rubAmount === "invalid") return c.json({ error: "rubAmount must be a positive integer" }, 400);
    const icon = parseIcon(b.icon);
    if (icon === "invalid") return c.json({ error: "icon must be ≤200 characters" }, 400);
    const offer = createOffer(db, {
      title: b.title,
      amount: String(b.amount),
      asset: b.asset,
      starsAmount,
      rubAmount,
      icon,
      active: b.active,
      grantKind: b.grantKind,
      grantAmount: Number(b.grantAmount),
    });
    return c.json({ offer });
  });

  app.patch("/admin/offers/:id", requireAdmin, async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id)) return c.json({ error: "invalid id" }, 400);
    const b = await readJsonBody<{
      title: string;
      amount: string;
      asset: string;
      starsAmount: number | null;
      rubAmount?: number | null;
      icon: string | null;
      active: boolean;
      grantKind: string;
      grantAmount: number;
    }>(c.req.raw);
    if (b.grantKind !== undefined && !isGrantKind(b.grantKind)) {
      return c.json({ error: "grantKind must be credits|subscription" }, 400);
    }
    const starsAmount = b.starsAmount !== undefined ? parseOptionalStarsAmount(b.starsAmount) : undefined;
    if (starsAmount === "invalid") return c.json({ error: "starsAmount must be a positive integer" }, 400);
    const rubAmount = b.rubAmount !== undefined ? parseOptionalRubAmount(b.rubAmount) : undefined;
    if (rubAmount === "invalid") return c.json({ error: "rubAmount must be a positive integer" }, 400);
    const icon = parseIcon(b.icon);
    if (icon === "invalid") return c.json({ error: "icon must be ≤200 characters" }, 400);
    const offer = updateOffer(db, id, {
      title: b.title,
      amount: b.amount !== undefined ? String(b.amount) : undefined,
      asset: b.asset,
      starsAmount,
      rubAmount,
      icon,
      active: b.active,
      grantKind: b.grantKind as GrantKind | undefined,
      grantAmount: b.grantAmount !== undefined ? Number(b.grantAmount) : undefined,
    });
    if (!offer) return c.json({ error: "offer not found" }, 404);
    return c.json({ offer });
  });

  app.delete("/admin/offers/:id", requireAdmin, (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id)) return c.json({ error: "invalid id" }, 400);
    deleteOffer(db, id);
    return c.json({ ok: true });
  });

  app.post("/admin/broadcast", requireAdmin, async (c) => {
    const b = await readJsonBody<{ text: string }>(c.req.raw);
    if (!b.text || b.text.trim().length === 0) return c.json({ error: "text is required" }, 400);
    if (!deps.send) return c.json({ error: "broadcast unavailable" }, 503);
    const result = await broadcast(db, b.text.trim(), deps.send);
    return c.json(result);
  });

  app.get("/admin/shop-settings", requireAdmin, (c) => {
    return c.json(getShopSettings(db));
  });

  app.post("/admin/shop-settings", requireAdmin, async (c) => {
    const b = await readJsonBody<{ shopName: string; supportContact: string; aboutText: string }>(c.req.raw);
    return c.json(setShopSettings(db, {
      shopName: b.shopName,
      supportContact: b.supportContact,
      aboutText: b.aboutText,
    }));
  });

  // --- Admin: user management ------------------------------------------

  app.get("/admin/users", requireAdmin, (c) => {
    return c.json({ users: listUsers(db) });
  });

  app.post("/admin/users/:chatId/credits", requireAdmin, async (c) => {
    const chatId = Number(c.req.param("chatId"));
    if (!Number.isFinite(chatId)) return c.json({ error: "invalid chatId" }, 400);
    const b = await readJsonBody<{ amount: number }>(c.req.raw);
    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount === 0) return c.json({ error: "amount must be a non-zero number" }, 400);
    if (amount > 0) {
      addCredits(db, chatId, amount, c.get("chatId"));
    } else {
      const user = getUser(db, chatId);
      if (!user || user.credits < Math.abs(amount)) return c.json({ error: "insufficient credits" }, 400);
      addCredits(db, chatId, amount, c.get("chatId"));
    }
    const updated = getUser(db, chatId);
    return c.json({ credits: updated?.credits ?? 0 });
  });

  app.post("/admin/users/:chatId/subscription", requireAdmin, async (c) => {
    const chatId = Number(c.req.param("chatId"));
    if (!Number.isFinite(chatId)) return c.json({ error: "invalid chatId" }, 400);
    const b = await readJsonBody<{ days: number }>(c.req.raw);
    const days = Number(b.days);
    if (!Number.isFinite(days) || days <= 0) return c.json({ error: "days must be a positive number" }, 400);
    extendSubscription(db, chatId, days, c.get("chatId"));
    const updated = getUser(db, chatId);
    return c.json({ subscriptionUntil: updated?.subscriptionUntil ?? null });
  });

  app.delete("/admin/users/:chatId/subscription", requireAdmin, async (c) => {
    const chatId = Number(c.req.param("chatId"));
    if (!Number.isFinite(chatId)) return c.json({ error: "invalid chatId" }, 400);
    revokeSubscription(db, chatId, c.get("chatId"));
    return c.json({ ok: true });
  });

  // --- Admin: access control (allowlist + admin roles) ------------------

  app.get("/admin/access", requireAdmin, (c) => {
    return c.json({ entries: getAllowlist(db) });
  });

  app.post("/admin/access/add", requireAdmin, async (c) => {
    const b = await readJsonBody<{ chatId: number; isAdmin?: boolean }>(c.req.raw);
    const chatId = Number(b.chatId);
    if (!Number.isFinite(chatId)) return c.json({ error: "chatId is required" }, 400);
    addToAllowlist(db, chatId, b.isAdmin ?? false);
    return c.json({ ok: true });
  });

  app.post("/admin/access/remove", requireAdmin, async (c) => {
    const b = await readJsonBody<{ chatId: number }>(c.req.raw);
    const chatId = Number(b.chatId);
    if (!Number.isFinite(chatId)) return c.json({ error: "chatId is required" }, 400);
    removeFromAllowlist(db, chatId);
    return c.json({ ok: true });
  });

  app.post("/admin/access/set-role", requireAdmin, async (c) => {
    const b = await readJsonBody<{ chatId: number; isAdmin: boolean }>(c.req.raw);
    const chatId = Number(b.chatId);
    if (!Number.isFinite(chatId)) return c.json({ error: "chatId is required" }, 400);
    setChatAdminRole(db, chatId, b.isAdmin ?? false);
    return c.json({ ok: true });
  });

  // --- Admin: provider config -------------------------------------------

  app.get("/admin/provider-config", requireAdmin, (c) => {
    const configs = AVAILABLE_PROVIDERS.map((id) => {
      const envDefaults = getProviderDefaults(id);
      const dbOverrides = getProviderOverrides(db, id);
      return {
        id,
        envDefaults,
        dbOverrides,
        effective: {
          model: dbOverrides.model ?? envDefaults.model,
          baseUrl: dbOverrides.baseUrl ?? envDefaults.baseUrl,
        },
      };
    });
    return c.json({ providers: configs });
  });

  app.post("/admin/provider-config/:id", requireAdmin, async (c) => {
    const id = c.req.param("id");
    if (!isProviderId(id)) return c.json({ error: `unknown provider: ${id}` }, 400);
    const b = await readJsonBody<{ model?: string | null; baseUrl?: string | null }>(c.req.raw);
    setProviderOverrides(db, id, { model: b.model ?? null, baseUrl: b.baseUrl ?? null });
    const envDefaults = getProviderDefaults(id);
    const dbOverrides = getProviderOverrides(db, id);
    return c.json({
      id,
      envDefaults,
      dbOverrides,
      effective: {
        model: dbOverrides.model ?? envDefaults.model,
        baseUrl: dbOverrides.baseUrl ?? envDefaults.baseUrl,
      },
    });
  });

  // --- Admin: unified settings editor -----------------------------------

  app.get("/admin/all-settings", requireAdmin, (c) => {
    return c.json({ settings: getAllSettings(db) });
  });

  app.post("/admin/all-settings", requireAdmin, async (c) => {
    const b = await readJsonBody<{ key: string; value: string }>(c.req.raw);
    if (!b.key || b.value === undefined) return c.json({ error: "key and value are required" }, 400);
    createSetting(db, b.key, b.value);
    return c.json({ ok: true });
  });

  app.post("/admin/all-settings/:key", requireAdmin, async (c) => {
    const key = c.req.param("key");
    const b = await readJsonBody<{ value?: string | null }>(c.req.raw);
    setSettingValue(db, key, b.value ?? null);
    return c.json({ ok: true });
  });

  // --- Admin: payments toggle ------------------------------------------

  app.get("/admin/payments-config", requireAdmin, (c) => {
    const dbVal = getPaymentsEnabled(db, env.paymentsEnabled);
    const hasDbOverride = (() => {
      const row = db.query<{ value: string }, [string]>(`SELECT value FROM settings WHERE key = 'payments_enabled'`).get("payments_enabled");
      return row !== null;
    })();
    return c.json({ paymentsEnabled: dbVal, source: hasDbOverride ? "db" : "env" });
  });

  app.post("/admin/payments-config", requireAdmin, async (c) => {
    const b = await readJsonBody<{ paymentsEnabled?: boolean | null }>(c.req.raw);
    setPaymentsEnabled(db, b.paymentsEnabled ?? null);
    return c.json({ ok: true });
  });

  // --- Admin: open access toggle (allowlist bypass) -----------------------

  app.get("/admin/access-config", requireAdmin, (c) => {
    return c.json({ openAccess: getOpenAccess(db) });
  });

  app.post("/admin/access-config", requireAdmin, async (c) => {
    const b = await readJsonBody<{ openAccess?: boolean }>(c.req.raw);
    if (typeof b.openAccess !== "boolean") return c.json({ error: "openAccess must be boolean" }, 400);
    setOpenAccess(db, b.openAccess);
    return c.json({ ok: true });
  });

  // --- Admin: grant history ----------------------------------------------

  app.get("/admin/grant-history", requireAdmin, (c) => {
    const chatIdParam = c.req.query("chatId");
    if (chatIdParam) {
      const chatId = Number(chatIdParam);
      if (!Number.isFinite(chatId)) return c.json({ error: "invalid chatId" }, 400);
      return c.json({ history: getGrantHistoryForUser(db, chatId) });
    }
    const limit = Math.min(Math.max(Number(c.req.query("limit")) || 50, 1), 200);
    const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
    const total = countGrantHistory(db);
    return c.json({ history: getAllGrantHistory(db, limit, offset), total });
  });

  // --- Audio: download-to-chat, history, streaming -----------------------

  if (deps.audio) {
    app.route("/", createAudioRoutes(db, deps.audio));
  }

  // --- Playlist generation ---------------------------------------------

  app.post("/generate", async (c) => {
    const chatId = c.get("chatId");
    const body = await readJsonBody<{ prompt: string }>(c.req.raw);
    if (!body.prompt || body.prompt.trim().length === 0) {
      return c.json({ error: "prompt is required" }, 400);
    }
    const outcome = await startGeneration(db, chatId, body.prompt.trim());
    if (outcome.status === "clarify") {
      setPendingClarify(db, chatId, {
        kind: "awaiting_clarify",
        originalPrompt: body.prompt.trim(),
        messages: outcome.messages,
        question: outcome.question,
        options: outcome.options,
        round: outcome.round,
      });
      return c.json({ status: "clarify", question: outcome.question, options: outcome.options });
    }
    clearSession(db, chatId);
    if (outcome.status === "rate_limited") return c.json(outcome, 429);
    return c.json(outcome);
  });

  app.post("/generate/stream", async (c) => {
    const chatId = c.get("chatId");
    const body = await readJsonBody<{ prompt: string }>(c.req.raw);
    if (!body.prompt || body.prompt.trim().length === 0) {
      return c.json({ error: "prompt is required" }, 400);
    }
    const prompt = body.prompt.trim();
    return streamSSE(c, async (stream) => {
    const outcome = await startGeneration(db, chatId, prompt, (e) => {
      stream.writeSSE({ data: JSON.stringify({ type: "agent_event", event: e }) }).catch(() => {});
    });
    if (outcome.status === "clarify") {
      setPendingClarify(db, chatId, {
        kind: "awaiting_clarify",
        originalPrompt: prompt,
        messages: outcome.messages,
        question: outcome.question,
        options: outcome.options,
        round: outcome.round,
      });
        await stream.writeSSE({
          data: JSON.stringify({ type: "outcome", outcome: { status: "clarify", question: outcome.question, options: outcome.options } }),
        });
        return;
      }
      clearSession(db, chatId);
      await stream.writeSSE({ data: JSON.stringify({ type: "outcome", outcome }) });
    }, sseErrorOutcome);
  });

  app.post("/generate/resume", async (c) => {
    const chatId = c.get("chatId");
    const body = await readJsonBody<{ answer: string }>(c.req.raw);
    const pending = getPendingClarify(db, chatId);
    if (!pending) return c.json({ error: "no pending clarification for this chat" }, 400);
    if (!body.answer || body.answer.trim().length === 0) {
      return c.json({ error: "answer is required" }, 400);
    }
    const outcome = await resumeGeneration(db, chatId, pending.originalPrompt, pending.messages, body.answer.trim(), pending.round);
    if (outcome.status === "clarify") {
      setPendingClarify(db, chatId, {
        kind: "awaiting_clarify",
        originalPrompt: pending.originalPrompt,
        messages: outcome.messages,
        question: outcome.question,
        options: outcome.options,
        round: outcome.round,
      });
      return c.json({ status: "clarify", question: outcome.question, options: outcome.options });
    }
    // Keep the pending clarification on error/needs_purchase/rate_limited so the
    // user can re-answer instead of being stranded with no session to resume.
    if (outcome.status === "ok") clearSession(db, chatId);
    return c.json(outcome);
  });

  app.post("/generate/resume/stream", async (c) => {
    const chatId = c.get("chatId");
    const body = await readJsonBody<{ answer: string }>(c.req.raw);
    const pending = getPendingClarify(db, chatId);
    if (!pending) return c.json({ error: "no pending clarification for this chat" }, 400);
    if (!body.answer || body.answer.trim().length === 0) {
      return c.json({ error: "answer is required" }, 400);
    }
    const answer = body.answer.trim();
    return streamSSE(c, async (stream) => {
      const outcome = await resumeGeneration(db, chatId, pending.originalPrompt, pending.messages, answer, pending.round, (e) => {
        stream.writeSSE({ data: JSON.stringify({ type: "agent_event", event: e }) }).catch(() => {});
      });
      if (outcome.status === "clarify") {
        setPendingClarify(db, chatId, {
          kind: "awaiting_clarify",
          originalPrompt: pending.originalPrompt,
          messages: outcome.messages,
          question: outcome.question,
          options: outcome.options,
          round: outcome.round,
        });
        await stream.writeSSE({
          data: JSON.stringify({ type: "outcome", outcome: { status: "clarify", question: outcome.question, options: outcome.options } }),
        });
        return;
      }
      // Keep the pending clarification on error/needs_purchase/rate_limited so
      // the user can re-answer instead of being stranded with no session.
      if (outcome.status === "ok") clearSession(db, chatId);
      await stream.writeSSE({ data: JSON.stringify({ type: "outcome", outcome }) });
    }, sseErrorOutcome);
  });

  app.post("/generate/extend", async (c) => {
    const chatId = c.get("chatId");
    const body = await readJsonBody<{ generationId: number; prompt: string }>(c.req.raw);
    if (!body.generationId || typeof body.generationId !== "number") {
      return c.json({ error: "generationId is required" }, 400);
    }
    if (!body.prompt || body.prompt.trim().length === 0) {
      return c.json({ error: "prompt is required" }, 400);
    }
    const outcome = await extendGeneration(db, chatId, body.generationId, body.prompt.trim());
    if (outcome.status === "clarify") {
      setPendingClarify(db, chatId, {
        kind: "awaiting_clarify",
        originalPrompt: body.prompt.trim(),
        messages: outcome.messages,
        question: outcome.question,
        options: outcome.options,
        round: outcome.round,
      });
      return c.json({ status: "clarify", question: outcome.question, options: outcome.options });
    }
    // Only clear the session after a successful extend; keep any pending
    // clarification from another flow intact on error/needs_purchase/rate_limited.
    if (outcome.status === "ok") clearSession(db, chatId);
    if (outcome.status === "rate_limited") return c.json(outcome, 429);
    return c.json(outcome);
  });

  app.post("/generate/extend/stream", async (c) => {
    const chatId = c.get("chatId");
    const body = await readJsonBody<{ generationId: number; prompt: string }>(c.req.raw);
    if (!body.generationId || typeof body.generationId !== "number") {
      return c.json({ error: "generationId is required" }, 400);
    }
    if (!body.prompt || body.prompt.trim().length === 0) {
      return c.json({ error: "prompt is required" }, 400);
    }
    const generationId = body.generationId;
    const prompt = body.prompt.trim();
    return streamSSE(c, async (stream) => {
      const outcome = await extendGeneration(db, chatId, generationId, prompt, (e) => {
        stream.writeSSE({ data: JSON.stringify({ type: "agent_event", event: e }) }).catch(() => {});
      });
      if (outcome.status === "clarify") {
        setPendingClarify(db, chatId, {
          kind: "awaiting_clarify",
          originalPrompt: prompt,
          messages: outcome.messages,
          question: outcome.question,
          options: outcome.options,
          round: outcome.round,
        });
        await stream.writeSSE({
          data: JSON.stringify({ type: "outcome", outcome: { status: "clarify", question: outcome.question, options: outcome.options } }),
        });
        return;
      }
      // Only clear the session after a successful extend; keep any pending
      // clarification from another flow intact on error/needs_purchase/rate_limited.
      if (outcome.status === "ok") clearSession(db, chatId);
      await stream.writeSSE({ data: JSON.stringify({ type: "outcome", outcome }) });
    }, sseErrorOutcome);
  });

  return app;
}
