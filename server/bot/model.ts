import { Bot } from "grammy";
import type { AppDb } from "../db";
import type { BotContext } from "./context";
import { getActiveModel, setActiveModel } from "../access/generations-store";
import { getActiveProviderId } from "../lib/settings";
import { heading } from "./emoji";

const AVAILABLE_MODELS = ["claude-sonnet-5", "claude-4", "claude-3", "gpt-4o", "gpt-4", "gpt-3.5-turbo"];

export function registerModel(bot: Bot<BotContext>, db: AppDb): void {
  bot.command("model", async (ctx) => {
    const chatId = ctx.chat.id;
    const arg = ctx.match?.toString().trim();

    if (!arg) {
      const current = getActiveModel(db, chatId) ?? getActiveProviderId(db, "opencode");
      const models = AVAILABLE_MODELS.join(", ");
      await ctx.reply(`${heading("gear", "МОДЕЛЬ")}\n\nТекущая: ${current}\n\nДоступны: /model &lt;имя&gt;\n${models}`, {
        parse_mode: "HTML",
      });
      return;
    }

    if (!AVAILABLE_MODELS.includes(arg)) {
      await ctx.reply(`Модель «${arg}» не найдена.\nДоступны: ${AVAILABLE_MODELS.join(", ")}`);
      return;
    }

    setActiveModel(db, chatId, arg);
    await ctx.reply(`Модель установлена: ${arg}.`);
  });
}
