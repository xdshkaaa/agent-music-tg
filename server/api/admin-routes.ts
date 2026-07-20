import { Hono } from "hono";
import type { AppDb } from "../db";
import type { AppEnv, ApiDeps } from "./context";
import { requireAdmin } from "./middleware";
import { AVAILABLE_PROVIDERS, isProviderId, getProviderDefaults, type ProviderId } from "../agent/registry";
import { AVAILABLE_BACKENDS, isMusicBackend } from "../music/registry";
import {
  getActiveProviderId, setActiveProviderId,
  getActiveBackendId, setActiveBackendId,
  getProviderOverrides, setProviderOverrides,
  getPaymentsEnabled, setPaymentsEnabled,
  getOpenAccess, setOpenAccess,
  getAllSettings, setSettingValue, createSetting,
  getShopSettings, setShopSettings,
  getReferralSettings, setReferralSettings,
} from "../lib/settings";
import { getUser, listUsers, addCredits, extendSubscription, revokeSubscription } from "../access/users-store";
import {
  listOffers,
  createOffer,
  updateOffer,
  deleteOffer,
  type GrantKind,
} from "../payments/offers-store";
import { isSupportedAsset, SUPPORTED_ASSETS } from "../payments/crypto-pay";
import { getAdminStats } from "../admin/stats";
import {
  broadcast,
  parseBroadcastButtonPresets,
  resolveBroadcastMediaKind,
  validateBroadcastMessage,
  MAX_BROADCAST_FILE_BYTES,
  MAX_BROADCAST_PHOTO_BYTES,
  type BroadcastButtonPreset,
  type BroadcastMedia,
} from "../admin/broadcast";
import { getGrantHistoryForUser, getAllGrantHistory, countGrantHistory } from "../admin/grant-history";
import { getAllowlist, addToAllowlist, removeFromAllowlist, setChatAdminRole } from "../lib/access-control";
import { env } from "../env";
import { DEFAULT_PROVIDER, DEFAULT_BACKEND, readJsonBody } from "./shared";

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

/** Admin-only settings, stats, offers, broadcast, users, access control, and grant history. */
export function createAdminRoutes(db: AppDb, deps: ApiDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // --- Active AI provider / music backend -------------------------------
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

  // --- Stats, offers, broadcast, shop settings --------------------------

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
    if (!deps.send) return c.json({ error: "broadcast unavailable" }, 503);
    let text = "";
    let buttons: BroadcastButtonPreset[] | null = [];
    let media: BroadcastMedia | undefined;

    if ((c.req.header("content-type") ?? "").toLowerCase().includes("multipart/form-data")) {
      let form: FormData;
      try {
        form = await c.req.formData();
      } catch {
        return c.json({ error: "Не удалось прочитать форму рассылки." }, 400);
      }
      const textValue = form.get("text");
      text = typeof textValue === "string" ? textValue.trim() : "";
      const buttonsValue = form.get("buttons");
      try {
        buttons = parseBroadcastButtonPresets(
          typeof buttonsValue === "string" && buttonsValue.length > 0 ? JSON.parse(buttonsValue) : [],
        );
      } catch {
        buttons = null;
      }

      const mediaValue = form.get("media");
      if (mediaValue instanceof File) {
        const filename = (mediaValue.name.split(/[\\/]/).pop() || "attachment").slice(0, 255);
        const mimeType = mediaValue.type || "application/octet-stream";
        const kind = resolveBroadcastMediaKind(filename, mimeType);
        const maxBytes = kind === "photo" ? MAX_BROADCAST_PHOTO_BYTES : MAX_BROADCAST_FILE_BYTES;
        if (mediaValue.size > maxBytes) {
          return c.json(
            {
              error: kind === "photo"
                ? "Изображение должно быть не больше 10 МБ."
                : "Вложение должно быть не больше 50 МБ.",
            },
            400,
          );
        }
        media = {
          kind,
          data: new Uint8Array(await mediaValue.arrayBuffer()),
          filename,
          mimeType,
        };
      }
    } else {
      const body = await readJsonBody<{ text?: string; buttons?: unknown }>(c.req.raw);
      text = typeof body.text === "string" ? body.text.trim() : "";
      buttons = parseBroadcastButtonPresets(body.buttons ?? []);
    }

    if (!buttons) return c.json({ error: "Выбран неизвестный шаблон кнопки." }, 400);
    const message = { text, buttons, media };
    const validationError = validateBroadcastMessage(message);
    if (validationError) return c.json({ error: validationError }, 400);
    const result = await broadcast(db, message, deps.send);
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

  // --- User management ---------------------------------------------------

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

  // --- Access control (allowlist + admin roles) -------------------------

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

  // --- Provider config ----------------------------------------------------

  function buildProviderConfig(id: ProviderId) {
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
  }

  app.get("/admin/provider-config", requireAdmin, (c) => {
    const configs = AVAILABLE_PROVIDERS.map((id) => buildProviderConfig(id));
    return c.json({ providers: configs });
  });

  app.post("/admin/provider-config/:id", requireAdmin, async (c) => {
    const id = c.req.param("id");
    if (!isProviderId(id)) return c.json({ error: `unknown provider: ${id}` }, 400);
    const b = await readJsonBody<{ model?: string | null; baseUrl?: string | null }>(c.req.raw);
    setProviderOverrides(db, id, { model: b.model ?? null, baseUrl: b.baseUrl ?? null });
    return c.json(buildProviderConfig(id));
  });

  // --- Unified settings editor --------------------------------------------

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

  // --- Payments toggle -----------------------------------------------------

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

  // --- Open access toggle (allowlist bypass) ------------------------------

  app.get("/admin/access-config", requireAdmin, (c) => {
    return c.json({ openAccess: getOpenAccess(db) });
  });

  app.post("/admin/access-config", requireAdmin, async (c) => {
    const b = await readJsonBody<{ openAccess?: boolean }>(c.req.raw);
    if (typeof b.openAccess !== "boolean") return c.json({ error: "openAccess must be boolean" }, 400);
    setOpenAccess(db, b.openAccess);
    return c.json({ ok: true });
  });

  // --- Referral settings ----------------------------------------------------

  app.get("/admin/referral-settings", requireAdmin, (c) => {
    return c.json(getReferralSettings(db));
  });

  app.put("/admin/referral-settings", requireAdmin, async (c) => {
    const body = await readJsonBody<{ rewardCredits?: number; maxPerUser?: number }>(c.req.raw);
    const patch: { rewardCredits?: number; maxPerUser?: number } = {};
    if (body?.rewardCredits !== undefined) {
      const n = Number(body.rewardCredits);
      if (!Number.isInteger(n) || n < 0) return c.json({ error: "rewardCredits must be a non-negative integer" }, 400);
      patch.rewardCredits = n;
    }
    if (body?.maxPerUser !== undefined) {
      const n = Number(body.maxPerUser);
      if (!Number.isInteger(n) || n < 0) return c.json({ error: "maxPerUser must be a non-negative integer" }, 400);
      patch.maxPerUser = n;
    }
    setReferralSettings(db, patch);
    return c.json(getReferralSettings(db));
  });

  // --- Grant history -------------------------------------------------------

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

  return app;
}
