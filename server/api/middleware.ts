import type { MiddlewareHandler } from "hono";
import type { AppDb } from "../db";
import { env } from "../env";
import { verifyInitData } from "../lib/telegram-init-data";
import { getChatRole } from "../lib/access-control";
import { getOpenAccess } from "../lib/settings";
import {
  listRequiredChannels,
  isSubscriptionGateEnabled,
} from "../access/channel-gate-store";
import { checkAllMemberships } from "../access/subscription-check";
import type { AppEnv } from "./context";
import { verifyInlineAuthToken } from "../lib/inline-auth";

/**
 * Verifies initData and populates the auth context. `allowUnlisted` skips only
 * the allowlist branch — signature verification is identical either way, so an
 * unlisted caller is still a proven Telegram user, just not an admitted one.
 */
function authenticate(db: AppDb, allowUnlisted: boolean): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    // Query fallback: <audio src> (the /stream endpoint) cannot set headers.
    // initData is the same signed credential either way; verifyInitData
    // rejects tampering identically.
    const initData = c.req.header("X-Telegram-Init-Data") ?? c.req.query("initData") ?? "";
    let verified = verifyInitData(initData, env.telegramBotToken);
    if (!verified) {
      const inlineAuth = verifyInlineAuthToken(
        c.req.header("X-Inline-Auth") ?? c.req.query("inlineAuth") ?? "",
        env.telegramBotToken,
      );
      if (inlineAuth) {
        verified = {
          chatId: inlineAuth.userId,
          user: { id: inlineAuth.userId },
          authDate: inlineAuth.authDate,
          startParam: null,
        };
      }
    }
    if (!verified) {
      return c.json({ error: "unauthenticated" }, 401);
    }
    const role = getChatRole(db, verified.chatId);
    // Admin toggle: open access lets any authenticated Telegram user in;
    // allowlist stays the source of admin rights either way.
    if (!allowUnlisted && !role.isAllowed && !getOpenAccess(db)) {
      return c.json({ error: "forbidden" }, 403);
    }
    c.set("chatId", role.chatId);
    c.set("isAdmin", role.isAdmin);
    c.set("startParam", verified.startParam);
    c.set("telegramUser", verified.user);
    await next();
  };
}

/**
 * Verifies the Mini App's Telegram initData (sent as `X-Telegram-Init-Data`)
 * and rejects any caller not on the allowlist. This is the actual enforcement
 * boundary — the Mini App UI hiding a screen is cosmetic, this is not.
 */
export function requireAuth(db: AppDb): MiddlewareHandler<AppEnv> {
  return authenticate(db, false);
}

/**
 * Authentication without the allowlist gate, for reading a shared playlist.
 * A share link is meant to work for someone who is not a user yet — that is the
 * entire point of it — so this is the one route where a verified but unadmitted
 * chat gets a 200. Never mount anything else on it.
 */
export function requireAuthAllowUnlisted(db: AppDb): MiddlewareHandler<AppEnv> {
  return authenticate(db, true);
}

/** Must run after requireAuth. Rejects non-admin chats, independent of any UI. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("isAdmin")) {
    return c.json({ error: "admin only" }, 403);
  }
  await next();
};

/**
 * Subscription gate for the Mini App API. Rejects non-subscribed users with a
 * 403 carrying the list of required channels, so the Mini App can show its own
 * gate screen.
 *
 * Skips (calls next()) when:
 * - the caller is an admin
 * - the gate is disabled or has no required channels
 * - getChatMember is not wired (fail-open, matching other optional deps)
 *
 * Uses the TTL-cached check (force=false) since this runs on every gated
 * request. The recheck route uses force=true for manual re-validation.
 */
export function requireSubscription(db: AppDb, deps: { getChatMember?: (channelId: number, chatId: number) => Promise<{ status: string }> }): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (c.get("isAdmin")) return next();
    if (!deps.getChatMember) return next();
    if (!isSubscriptionGateEnabled(db)) return next();

    const channels = listRequiredChannels(db);
    if (channels.length === 0) return next();

    const chatId = c.get("chatId");
    const membershipDeps = { getChatMember: deps.getChatMember };

    const allOk = await checkAllMemberships(db, membershipDeps, channels, chatId, false);
    if (allOk) return next();

    return c.json(
      {
        error: "subscription_required",
        channels: channels.map((ch) => ({
          title: ch.title,
          username: ch.username,
          inviteLink: ch.inviteLink,
        })),
      },
      403,
    );
  };
}
