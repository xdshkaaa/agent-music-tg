import { Bot } from "grammy";
import type { AppDb } from "../db";
import type { BotContext } from "./context";
import { getActiveModel, setActiveModel } from "../access/generations-store";
import { getActiveProviderId } from "../lib/settings";
import { detailBlock, escapeHtml, messageHint, messageTitle, statusMessage } from "./message-format";

const AVAILABLE_MODELS = ["claude-sonnet-5", "claude-4", "claude-3", "gpt-4o", "gpt-4", "gpt-3.5-turbo"];

export function registerModel(bot: Bot<BotContext>, db: AppDb): void {
  bot.command("model", async (ctx) => {
    const chatId = ctx.chat.id;
    const arg = ctx.match?.toString().trim();

    if (!arg) {
      const current = getActiveModel(db, chatId) ?? getActiveProviderId(db, "opencode");
      const models = AVAILABLE_MODELS.map((model) => `<code>${escapeHtml(model)}</code>`).join(" · ");
      await ctx.reply(`${messageTitle("gear", "AI-модель")}\n${messageHint("Модель используется для новых генераций.")}\n\n${detailBlock([`<b>Текущая</b>  ${escapeHtml(current)}`])}\n\n<b>Доступные модели</b>\n${models}\n\n/model &lt;имя&gt;`, {
        parse_mode: "HTML",
      });
      return;
    }

    if (!AVAILABLE_MODELS.includes(arg)) {
      await ctx.reply(
        statusMessage("warning", "Модель не найдена", `Доступны: ${AVAILABLE_MODELS.join(", ")}`),
        { parse_mode: "HTML" },
      );
      return;
    }

    setActiveModel(db, chatId, arg);
    await ctx.reply(statusMessage("check", "Модель изменена", arg), { parse_mode: "HTML" });
  });
}
