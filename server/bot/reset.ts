import { Bot } from "grammy";
import type { AppDb } from "../db";
import type { BotContext } from "./context";
import { clearSession, getPendingClarify } from "./session";
import { heading } from "./emoji";

export function registerReset(bot: Bot<BotContext>, db: AppDb): void {
  bot.command("reset", async (ctx) => {
    const chatId = ctx.chat.id;
    const hasClarify = getPendingClarify(db, chatId);

    if (!hasClarify) {
      await ctx.reply(`${heading("info", "Нет активной сессии для сброса.")}`, { parse_mode: "HTML" });
      return;
    }

    clearSession(db, chatId);
    await ctx.reply(`${heading("check", "Сессия сброшена.")}`, { parse_mode: "HTML" });
  });
}
