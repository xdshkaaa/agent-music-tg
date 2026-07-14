import { Hono } from "hono";
import type { AppDb } from "../db";
import type { AppEnv } from "./context";
import { requireAuth, requireAdmin } from "./middleware";
import { AVAILABLE_PROVIDERS, isProviderId, getProviderDefaults } from "../agent/registry";
import { AVAILABLE_BACKENDS, isMusicBackend } from "../music/registry";
import {
  getActiveProviderId, setActiveProviderId,
  getActiveBackendId, setActiveBackendId,
  getProviderOverrides, setProviderOverrides,
  getPaymentsEnabled, setPaymentsEnabled,
  getAllSettings, setSettingValue, createSetting,
  getShopSettings, setShopSettings,
} from "../lib/settings";
import { getPendingClarify, setPendingClarify, clearSession } from "../bot/session";
import { startGeneration, resumeGeneration } from "../core/run-generation";
import { getUser, upsertUser, listUsers, addCredits, extendSubscription, revokeSubscription, claimTrial, type User } from "../access/users-store";
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
import { listInvoicesForChat } from "../payments/invoices-store";
import { purchaseOffer, OfferUnavailableError } from "../payments/purchase";
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

export function createApiRoutes(db: AppDb, deps: ApiDeps = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("*", requireAuth(db));

  // Record every authenticated caller as a known user (audience + stats).
  app.use("*", async (c, next) => {
    upsertUser(db, c.get("chatId"));
    await next();
  });

  app.get("/me", async (c) => {
    const user = getUser(db, c.get("chatId"));
    let photoUrl: string | null = null;
    if (user?.photoFileId) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/getFile?file_id=${user.photoFileId}`);
        const data = await res.json() as { ok: boolean; result?: { file_path: string; file_unique_id: string } };
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
      } catch { /* photoUrl stays null */ }
    }
    return c.json({
      chatId: c.get("chatId"),
      isAdmin: c.get("isAdmin"),
      credits: user?.credits ?? 0,
      subscriptionUntil: user?.subscriptionUntil ?? null,
      trial: trialStatus(user),
      photoUrl,
      // Additive: present only when the bot previously recorded a @username
      // for this chat (via /start). Omitted (not null) when unknown, so the
      // MeResponse shape stays backward-compatible for older clients.
      ...(user?.username ? { username: user.username } : {}),
    });
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
    const { headerIcon, headerTitle } = getShopSettings(db);
    return c.json({ headerIcon, headerTitle });
  });

  app.post("/invoices", async (c) => {
    if (!getPaymentsEnabled(db, env.paymentsEnabled)) {
      return c.json({ error: "payments disabled" }, 503);
    }
    const body = await readJsonBody<{ offerId: number; method?: string }>(c.req.raw);
    const offerId = Number(body.offerId);
    if (!Number.isFinite(offerId)) return c.json({ error: "offerId is required" }, 400);
    const method = body.method ?? "crypto";
    if (method !== "crypto" && method !== "stars") return c.json({ error: "method must be crypto|stars" }, 400);

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
      return c.json({ ...result, method: "crypto" });
    } catch (e) {
      if (e instanceof OfferUnavailableError) return c.json({ error: e.message }, 400);
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  });

  // --- Admin-only: active AI provider / music backend -----------------
  // Enforced by requireAdmin below, independent of whether the Mini App
  // renders this screen for the calling chat.

  app.get("/admin/settings", requireAdmin, (c) => {
    return c.json({
      activeProvider: getActiveProviderId(db, DEFAULT_PROVIDER),
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
    return c.json(getAdminStats(db));
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
      icon: string | null;
      active: boolean;
      grantKind: string;
      grantAmount: number;
    }>(c.req.raw);
    if (!b.title || !b.amount || !b.asset || !isGrantKind(b.grantKind) || !Number.isFinite(Number(b.grantAmount))) {
      return c.json({ error: "title, amount, asset, grantKind (credits|subscription), grantAmount are required" }, 400);
    }
    const starsAmount = parseRequiredStarsAmount(b.starsAmount);
    if (starsAmount === "invalid") return c.json({ error: "starsAmount must be a positive integer" }, 400);
    const icon = parseIcon(b.icon);
    if (icon === "invalid") return c.json({ error: "icon must be ≤200 characters" }, 400);
    const offer = createOffer(db, {
      title: b.title,
      amount: String(b.amount),
      asset: b.asset,
      starsAmount,
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
    const icon = parseIcon(b.icon);
    if (icon === "invalid") return c.json({ error: "icon must be ≤200 characters" }, 400);
    const offer = updateOffer(db, id, {
      title: b.title,
      amount: b.amount !== undefined ? String(b.amount) : undefined,
      asset: b.asset,
      starsAmount,
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
        messages: outcome.messages,
        question: outcome.question,
        options: outcome.options,
      });
      return c.json({ status: "clarify", question: outcome.question, options: outcome.options });
    }
    clearSession(db, chatId);
    return c.json(outcome);
  });

  app.post("/generate/resume", async (c) => {
    const chatId = c.get("chatId");
    const body = await readJsonBody<{ answer: string }>(c.req.raw);
    const pending = getPendingClarify(db, chatId);
    if (!pending) return c.json({ error: "no pending clarification for this chat" }, 400);
    if (!body.answer || body.answer.trim().length === 0) {
      return c.json({ error: "answer is required" }, 400);
    }
    const outcome = await resumeGeneration(db, chatId, "", pending.messages, body.answer.trim());
    if (outcome.status === "clarify") {
      setPendingClarify(db, chatId, {
        kind: "awaiting_clarify",
        messages: outcome.messages,
        question: outcome.question,
        options: outcome.options,
      });
      return c.json({ status: "clarify", question: outcome.question, options: outcome.options });
    }
    clearSession(db, chatId);
    return c.json(outcome);
  });

  return app;
}
