import { Bot } from "grammy";
import type { AppDb } from "../db";
import type { BotContext } from "./context";
import { listGenerations } from "../access/generations-store";
import { heading } from "./emoji";

export async function showHistory(ctx: BotContext, db: AppDb): Promise<void> {
  const chatId = ctx.chat!.id;
  const gens = listGenerations(db, chatId, 10);

  if (gens.length === 0) {
    await ctx.reply(`${heading("info", "История генераций пуста.")}\n\nОтправьте текстовый запрос, чтобы создать плейлист.`, {
      parse_mode: "HTML",
    });
    return;
  }

  const lines: string[] = [`<b>${heading("music", "ИСТОРИЯ ──")}</b>\n`];
  for (const g of gens) {
    const promptSnippet = g.prompt.length > 40 ? g.prompt.slice(0, 40) + "..." : g.prompt;
    const date = new Date(g.createdAt * 1000).toLocaleDateString("ru-RU");
    const name = g.playlistName ?? "—";
    lines.push(`• ${date} — <b>${name}</b> — "${promptSnippet}"`);
  }

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
}

export function registerHistory(bot: Bot<BotContext>, db: AppDb): void {
  bot.command("history", async (ctx) => {
    await showHistory(ctx, db);
  });
}
