import { Bot } from "grammy";
import type { AppDb } from "../db";
import type { BotContext } from "./context";
import { getUser } from "../access/users-store";
import { trialActive } from "../access/entitlements";
import { countGenerations } from "../access/generations-store";
import { detailBlock, detailRow, messageHint, messageTitle, statusMessage } from "./message-format";

export function registerCredits(bot: Bot<BotContext>, db: AppDb): void {
  bot.command("credits", async (ctx) => {
    const chatId = ctx.chat.id;
    const user = getUser(db, chatId);

    const subActive = user?.subscriptionUntil != null && user.subscriptionUntil > Math.floor(Date.now() / 1000);
    if (!user || (user.credits <= 0 && !trialActive(user) && !subActive)) {
      const text = `${statusMessage("wallet", "Генерации закончились", "Выберите пакет или подписку, чтобы продолжить.")}\n\n/buy — открыть варианты`;
      await ctx.reply(text, { parse_mode: "HTML" });
      return;
    }

    const rows = [detailRow("wallet", "Генерации", user.credits)];
    if (trialActive(user)) {
      rows.push(detailRow("gift", "Пробные", user.trialCredits));
    }
    rows.push(detailRow("fire", "Использовано", `${countGenerations(db, chatId)} ген.`));

    if (user.subscriptionUntil && user.subscriptionUntil > Math.floor(Date.now() / 1000)) {
      const until = new Date(user.subscriptionUntil * 1000).toLocaleDateString("ru-RU");
      rows.push(detailRow("ruler", "Подписка до", until));
    }

    const text = `${messageTitle("wallet", "Баланс")}\n${messageHint("Доступные генерации и активность")}\n\n${detailBlock(rows)}`;
    await ctx.reply(text, { parse_mode: "HTML" });
  });
}
