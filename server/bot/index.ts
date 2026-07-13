import { Bot, InlineKeyboard } from "grammy";
import type { AppDb } from "../db";
import { env } from "../env";
import type { BotContext } from "./context";
import { allowlistGate } from "./middleware";
import { startSpotifyLink } from "../spotify/oauth";
import { hasLinkedSpotify } from "../spotify/tokens";
import { getPendingClarify, setPendingClarify, clearSession } from "./session";
import { startGeneration, resumeGeneration, formatPlaylistReply } from "../core/run-generation";
import { AVAILABLE_PROVIDERS, isProviderId } from "../agent/registry";
import { AVAILABLE_BACKENDS, isMusicBackend } from "../music/registry";
import { getActiveProviderId, setActiveProviderId, getActiveBackendId, setActiveBackendId } from "../lib/settings";

export function createBot(db: AppDb): Bot<BotContext> {
  const bot = new Bot<BotContext>(env.telegramBotToken);
  bot.use(allowlistGate(db));

  bot.command("start", async (ctx) => {
    const keyboard = new InlineKeyboard().webApp("Open Mini App", env.publicOrigin);
    await ctx.reply(
      "Send me a mood or request (e.g. \"late night driving synthwave\") and I'll build you a playlist.\n\n" +
        "/link — connect your Spotify account\n" +
        "/app — open the Mini App",
      { reply_markup: keyboard },
    );
  });

  bot.command("app", async (ctx) => {
    const keyboard = new InlineKeyboard().webApp("Open Mini App", env.publicOrigin);
    await ctx.reply("Open the Mini App:", { reply_markup: keyboard });
  });

  bot.command("link", async (ctx) => {
    const url = startSpotifyLink(db, ctx.chat.id);
    await ctx.reply(`Connect your Spotify account:\n${url}\n\nThis link expires in 10 minutes.`);
  });

  bot.command("provider", async (ctx) => {
    if (!ctx.isAdmin) return; // regular users never see this control, per access-control spec
    const arg = ctx.match?.toString().trim();
    if (!arg) {
      const active = getActiveProviderId(db, "opencode");
      await ctx.reply(`Active provider: ${active}\nAvailable: ${AVAILABLE_PROVIDERS.join(", ")}\nUsage: /provider <id>`);
      return;
    }
    if (!isProviderId(arg)) {
      await ctx.reply(`Unknown provider "${arg}". Available: ${AVAILABLE_PROVIDERS.join(", ")}`);
      return;
    }
    setActiveProviderId(db, arg);
    await ctx.reply(`Active provider set to ${arg}.`);
  });

  bot.command("backend", async (ctx) => {
    if (!ctx.isAdmin) return; // regular users never see this control, per access-control spec
    const arg = ctx.match?.toString().trim();
    if (!arg) {
      const active = getActiveBackendId(db, "youtube-music");
      await ctx.reply(`Active backend: ${active}\nAvailable: ${AVAILABLE_BACKENDS.join(", ")}\nUsage: /backend <id>`);
      return;
    }
    if (!isMusicBackend(arg)) {
      await ctx.reply(`Unknown backend "${arg}". Available: ${AVAILABLE_BACKENDS.join(", ")}`);
      return;
    }
    setActiveBackendId(db, arg);
    await ctx.reply(`Active backend set to ${arg}.`);
  });

  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return; // unknown commands: ignore rather than forwarding to generation

    const backendId = getActiveBackendId(db, "spotify");
    if (backendId === "spotify" && !hasLinkedSpotify(db, chatId)) {
      await ctx.reply("Link your Spotify account first with /link.");
      return;
    }

    const pending = getPendingClarify(db, chatId);
    await ctx.replyWithChatAction("typing");

    const outcome = pending
      ? await resumeGeneration(db, chatId, text, pending.messages, text)
      : await startGeneration(db, chatId, text);

    if (outcome.status === "clarify") {
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
      await ctx.reply(`Couldn't generate a playlist: ${outcome.message}`);
      return;
    }
    await ctx.reply(formatPlaylistReply(outcome.playlist), { parse_mode: "Markdown" });
  });

  return bot;
}
