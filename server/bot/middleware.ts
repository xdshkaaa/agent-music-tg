import type { NextFunction } from "grammy";
import type { AppDb } from "../db";
import { getChatRole } from "../lib/access-control";
import type { BotContext } from "./context";

/**
 * Drops any update from a chat not on the allowlist before it reaches a handler.
 * No reply is sent to unknown chats — the bot must not reveal its existence/behavior.
 */
export function allowlistGate(db: AppDb) {
  return async (ctx: BotContext, next: NextFunction) => {
    // pre_checkout_query updates carry no chat — fall back to the sender id
    // (private-chat bot: chat id === user id) so Stars checkouts aren't dropped.
    const chatId = ctx.chat?.id ?? ctx.from?.id;
    if (chatId === undefined) return;
    const role = getChatRole(db, chatId);
    if (!role.isAllowed) return;
    ctx.isAdmin = role.isAdmin;
    await next();
  };
}
