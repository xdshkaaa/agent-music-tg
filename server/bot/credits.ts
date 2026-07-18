import { Bot } from "grammy";
import type { AppDb } from "../db";
import type { BotContext } from "./context";
import { getUser } from "../access/users-store";
import { trialActive } from "../access/entitlements";
import { countGenerations } from "../access/generations-store";
import { heading, accent } from "./emoji";

export function registerCredits(bot: Bot<BotContext>, db: AppDb): void {
  bot.command("credits", async (ctx) => {
    const chatId = ctx.chat.id;
    const user = getUser(db, chatId);

    const subActive = user?.subscriptionUntil != null && user.subscriptionUntil > Math.floor(Date.now() / 1000);
    if (!user || (user.credits <= 0 && !trialActive(user) && !subActive)) {
      const wallet = accent("wallet");
      const text = `${wallet ? wallet + " " : ""}Нет доступа.\n/buy: купить генерации или подписку`;
      await ctx.reply(text, { parse_mode: "HTML" });
      return;
    }

    const wallet = accent("wallet");
    const ruler = accent("ruler");
    const flame = accent("fire");
    const lines: string[] = [`<b>${heading("wallet", "КРЕДИТЫ")}</b>`];
    lines.push(`${wallet ? wallet + " " : ""}Генерации: ${user.credits}`);
    if (trialActive(user)) {
      lines.push(`${wallet ? wallet + " " : ""}Пробные: ${user.trialCredits}`);
    }
    lines.push(`${flame ? flame + " " : ""}Потрачено: ${countGenerations(db, chatId)} ген`);

    if (user.subscriptionUntil && user.subscriptionUntil > Math.floor(Date.now() / 1000)) {
      const until = new Date(user.subscriptionUntil * 1000).toLocaleDateString("ru-RU");
      lines.push(`${ruler ? ruler + " " : ""}Подписка до ${until}`);
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });
}
