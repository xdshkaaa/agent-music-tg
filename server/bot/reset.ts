import { Bot } from "grammy";
import type { AppDb } from "../db";
import type { BotContext } from "./context";
import { clearSession, getPendingClarify } from "./session";
import { statusMessage } from "./message-format";

export function registerReset(bot: Bot<BotContext>, db: AppDb): void {
  bot.command("reset", async (ctx) => {
    const chatId = ctx.chat.id;
    const hasClarify = getPendingClarify(db, chatId);

    if (!hasClarify) {
      await ctx.reply(statusMessage("info", "Сбрасывать нечего", "Активной сессии сейчас нет."), { parse_mode: "HTML" });
      return;
    }

    clearSession(db, chatId);
    await ctx.reply(statusMessage("check", "Сессия сброшена", "Можно начать новый запрос."), { parse_mode: "HTML" });
  });
}
