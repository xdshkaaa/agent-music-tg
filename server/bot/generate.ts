import { Bot } from "grammy";
import type { AppDb } from "../db";
import type { BotContext } from "./context";
import { startGeneration, resumeGeneration, formatPlaylistReply } from "../core/run-generation";
import { deliverAutoAudio } from "./auto-audio";
import { getPendingClarify, setPendingGeneratePrompt, clearSession } from "./session";
import { sendOffers, purchasePromptText } from "./shop";
import { heading } from "./emoji";

export async function showGenerate(ctx: BotContext, db: AppDb, arg?: string): Promise<void> {
  const chatId = ctx.chat!.id;

  if (!arg) {
    setPendingGeneratePrompt(db, chatId);
    await ctx.reply(`${heading("info", "Напиши запрос для генерации плейлиста:")}`, { parse_mode: "HTML" });
    return;
  }

  await ctx.replyWithChatAction("typing");

  const outcome = await startGeneration(db, chatId, arg);

  if (outcome.status === "needs_purchase") {
    clearSession(db, chatId);
    await sendOffers(ctx, db, purchasePromptText());
    return;
  }

  if (outcome.status === "clarify") {
    const { setPendingClarify } = await import("./session");
    setPendingClarify(db, chatId, {
      kind: "awaiting_clarify",
      messages: outcome.messages,
      question: outcome.question,
      options: outcome.options,
    });
    const optionsText = outcome.options.map((o, i) => `${i + 1}. ${o}`).join("\n");
    await ctx.reply(`${outcome.question}\n\n${optionsText}`);
    return;
  }

  clearSession(db, chatId);
  if (outcome.status === "error") {
    await ctx.reply(`Не удалось собрать плейлист: ${outcome.message}`);
    return;
  }
  await ctx.reply(formatPlaylistReply(outcome.playlist), { parse_mode: "Markdown" });
  deliverAutoAudio(db, chatId, outcome.playlist.tracks, outcome.playlist.name, ctx.api).catch(() => {});
}

export function registerGenerate(bot: Bot<BotContext>, db: AppDb): void {
  bot.command("generate", async (ctx) => {
    await showGenerate(ctx, db, ctx.match?.toString().trim());
  });
}
