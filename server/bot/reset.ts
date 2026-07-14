import { Bot } from "grammy";
import type { AppDb } from "../db";
import type { BotContext } from "./context";
import { clearSession, getPendingClarify, getPendingGeneratePrompt } from "./session";
import { heading } from "./emoji";

export function registerReset(bot: Bot<BotContext>, db: AppDb): void {
  bot.command("reset", async (ctx) => {
    const chatId = ctx.chat.id;
    const hasClarify = getPendingClarify(db, chatId);
    const hasGeneratePrompt = getPendingGeneratePrompt(db, chatId);

    if (!hasClarify && !hasGeneratePrompt) {
      await ctx.reply(`${heading("info", "Нет активной сессии для сброса.")}`, { parse_mode: "HTML" });
      return;
    }

    clearSession(db, chatId);
    await ctx.reply(`${heading("check", "Сессия сброшена.")}`, { parse_mode: "HTML" });
  });
}
