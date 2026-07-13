import type { MiddlewareHandler } from "hono";
import type { AppDb } from "../db";
import { env } from "../env";
import { verifyInitData } from "../lib/telegram-init-data";
import { getChatRole } from "../lib/access-control";
import type { AppEnv } from "./context";

/**
 * Verifies the Mini App's Telegram initData (sent as `X-Telegram-Init-Data`)
 * and rejects any caller not on the allowlist. This is the actual enforcement
 * boundary — the Mini App UI hiding a screen is cosmetic, this is not.
 */
export function requireAuth(db: AppDb): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const initData = c.req.header("X-Telegram-Init-Data") ?? "";
    const verified = verifyInitData(initData, env.telegramBotToken);
    if (!verified) {
      return c.json({ error: "unauthenticated" }, 401);
    }
    const role = getChatRole(db, verified.chatId);
    if (!role.isAllowed) {
      return c.json({ error: "forbidden" }, 403);
    }
    c.set("chatId", role.chatId);
    c.set("isAdmin", role.isAdmin);
    await next();
  };
}

/** Must run after requireAuth. Rejects non-admin chats, independent of any UI. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("isAdmin")) {
    return c.json({ error: "admin only" }, 403);
  }
  await next();
};
