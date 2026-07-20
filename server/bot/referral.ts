import { Bot, InlineKeyboard } from "grammy";
import type { AppDb } from "../db";
import type { BotContext } from "./context";
import { applyReferral, getReferralStats } from "../access/referral-store";
import { getReferralSettings } from "../lib/settings";
import { btnText, heading, accent } from "./emoji";
import type { ShopView } from "./shop";

let cachedBotUsername: string | null = null;

async function botUsername(bot: Bot<BotContext>): Promise<string> {
  if (cachedBotUsername) return cachedBotUsername;
  const me = await bot.api.getMe();
  cachedBotUsername = me.username;
  return me.username;
}

/** Row appended to every in-place section view; returns to the /start menu. */
function backRow(kb: InlineKeyboard): InlineKeyboard {
  return kb.row().text(btnText("Назад", "back"), "nav:menu");
}

export function formatGenerationCount(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const form = mod100 >= 11 && mod100 <= 14
    ? "генераций"
    : mod10 === 1
      ? "генерация"
      : mod10 >= 2 && mod10 <= 4
        ? "генерации"
        : "генераций";
  return `${count} ${form}`;
}

export async function buildReferralView(bot: Bot<BotContext>, db: AppDb, chatId: number): Promise<ShopView> {
  const username = await botUsername(bot);
  const link = `https://t.me/${username}?start=ref_${chatId}`;
  const stats = getReferralStats(db, chatId);
  const settings = getReferralSettings(db);
  const gift = accent("gift");
  const lines = [
    `<b>${heading("gift", "РЕФЕРАЛЬНАЯ ПРОГРАММА")}</b>`,
    `Приглашайте друзей — получайте ${formatGenerationCount(settings.rewardCredits)} за каждого.`,
    "",
    `${gift ? gift + " " : ""}Приглашено: ${stats.invitedCount}`,
    `Начислено генераций: ${stats.creditsEarned}`,
    "",
    `Ваша ссылка:\n<code>${link}</code>`,
  ];
  const kb = new InlineKeyboard().url(btnText("Поделиться", "gift"), `https://t.me/share/url?url=${encodeURIComponent(link)}`);
  return { text: lines.join("\n"), keyboard: backRow(kb) };
}

/** Registers /referral. Deep-link crediting (/start ref_<id>) is handled inline in bot/index.ts. */
export function registerReferral(bot: Bot<BotContext>, db: AppDb): void {
  bot.command("referral", async (ctx) => {
    const view = await buildReferralView(bot, db, ctx.chat!.id);
    await ctx.reply(view.text, { reply_markup: view.keyboard, parse_mode: "HTML" });
  });
}

export { applyReferral };
