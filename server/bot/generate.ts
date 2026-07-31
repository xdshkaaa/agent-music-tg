import { Bot, InlineKeyboard } from "grammy";
import type { AppDb } from "../db";
import { ackCallback, type BotContext } from "./context";
import type { AgentEvent } from "../agent/types";
import { startGeneration, resumeGeneration, type GenerationOutcome } from "../core/run-generation";
import { getGeneration } from "../access/generations-store";
import { insertDownload, hasActiveDownload } from "../audio/downloads-store";
import { processDownload } from "../audio/deliver";
import { createRuntimeAudioDeps } from "../audio/runtime";
import { env } from "../env";
import { btnText } from "./emoji";
import { detailBlock, escapeHtml, messageHint, messageTitle, statusMessage } from "./message-format";
import { getPendingClarify, setPendingClarify, clearSession, setPendingInput } from "./session";
import { offersKeyboard, purchasePromptText } from "./shop";

/**
 * Telegram rejects rapid edits to the same message, and the agent emits
 * reasoning deltas far faster than that. Progress is therefore coalesced: at
 * most one edit per interval, always carrying the latest state.
 */
export const PROGRESS_EDIT_INTERVAL_MS = 2_500;

export interface ProgressReporter {
  onEvent(event: AgentEvent): void;
}

/**
 * Converts the agent's event stream into throttled progress text.
 *
 * Exposed for tests: `flush` is what would hit the Telegram API, and `now` lets
 * a test drive the clock without waiting.
 */
export function createProgressReporter(
  flush: (text: string) => void,
  options: { intervalMs?: number; now?: () => number } = {},
): ProgressReporter {
  const intervalMs = options.intervalMs ?? PROGRESS_EDIT_INTERVAL_MS;
  const clock = options.now ?? Date.now;
  let lastSentAt = 0;
  let steps = 0;

  function describe(event: AgentEvent): string | null {
    if (event.kind === "tool_call") {
      steps += 1;
      const query = typeof event.args.query === "string" ? event.args.query : null;
      return query ? `Ищу: ${query}` : "Подбираю треки";
    }
    if (event.kind === "tool_result") return event.ok ? "Обрабатываю найденные треки" : "Пробую иначе";
    return null;
  }

  return {
    onEvent(event: AgentEvent): void {
      const line = describe(event);
      if (!line) return;
      const now = clock();
      // Drop, rather than queue, updates inside the interval: the final result
      // edit supersedes progress anyway, so a stale line is never worth an edit.
      if (now - lastSentAt < intervalMs) return;
      lastSentAt = now;
      flush(`${line} · шаг ${steps}`);
    },
  };
}

export function progressText(detail: string): string {
  return `${messageTitle("star", "Собираю плейлист")}\n${messageHint(detail)}`;
}

export interface GenerationView {
  text: string;
  keyboard: InlineKeyboard | undefined;
}

function playlistView(outcome: Extract<GenerationOutcome, { status: "ok" }>): GenerationView {
  const { playlist, generationId } = outcome;
  const lines = playlist.tracks.map(
    (track, i) => `${i + 1}. <b>${escapeHtml(track.title)}</b>\n    ${escapeHtml(track.artist)}`,
  );
  const kb = new InlineKeyboard()
    .text(btnText("Скачать в чат", "music"), `gen:dl:${generationId}`)
    .row()
    .webApp(btnText("Открыть в приложении", "app"), `${env.publicOrigin}/?tab=create`)
    .row()
    .text(btnText("Новый запрос", "search"), "nav:generate");
  return {
    text: [
      messageTitle("star", playlist.name),
      "",
      detailBlock(lines),
      "",
      messageHint(`${playlist.tracks.length} треков`),
    ].join("\n"),
    keyboard: kb,
  };
}

function clarifyView(outcome: Extract<GenerationOutcome, { status: "clarify" }>): GenerationView {
  const kb = new InlineKeyboard();
  for (const [i, option] of outcome.options.entries()) {
    kb.text(btnText(option.slice(0, 48), "info"), `gen:cl:${i}`).row();
  }
  return {
    text: `${messageTitle("info", "Уточните запрос")}\n\n${escapeHtml(outcome.question)}`,
    keyboard: kb,
  };
}

/**
 * Maps every generation outcome to what the user should see. Kept pure so the
 * whole matrix is testable without a live bot.
 */
export function outcomeView(outcome: GenerationOutcome): GenerationView {
  switch (outcome.status) {
    case "ok":
      return playlistView(outcome);
    case "clarify":
      return clarifyView(outcome);
    case "needs_purchase":
      return { text: purchasePromptText(), keyboard: undefined };
    case "rate_limited": {
      const at = new Date(outcome.retryAt * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      return {
        text: statusMessage("warning", "Лимит по подписке исчерпан", `Снова доступно в ${at}.`),
        keyboard: undefined,
      };
    }
    case "error":
      return { text: statusMessage("warning", "Не получилось", outcome.message), keyboard: undefined };
  }
}

export function generatePromptView(): GenerationView {
  return {
    text: `${messageTitle("star", "AI-плейлист")}\n${messageHint("Опишите настроение, жанр или занятие — соберу подборку.")}`,
    keyboard: new InlineKeyboard().text(btnText("В меню", "back"), "nav:menu"),
  };
}

/**
 * Runs a generation, streaming coalesced progress into one message that is then
 * replaced by the result. `run` is injected so the clarify round can reuse the
 * identical presentation path.
 */
async function runWithProgress(
  ctx: BotContext,
  db: AppDb,
  originalPrompt: string,
  run: (onEvent: (e: AgentEvent) => void) => Promise<GenerationOutcome>,
): Promise<void> {
  const chatId = ctx.chat!.id;
  const placeholder = await ctx.reply(progressText("Начинаю…"), { parse_mode: "HTML" });

  const reporter = createProgressReporter((detail) => {
    void ctx.api
      .editMessageText(chatId, placeholder.message_id, progressText(detail), { parse_mode: "HTML" })
      .catch(() => {
        // Throttled or unchanged — the next tick will carry the latest state.
      });
  });

  let outcome: GenerationOutcome;
  try {
    outcome = await run((event) => reporter.onEvent(event));
  } catch (e) {
    console.error("[bot generate]", e);
    outcome = { status: "error", message: "Внутренняя ошибка сервера. Попробуйте ещё раз." };
  }

  if (outcome.status === "clarify") {
    setPendingClarify(db, chatId, {
      kind: "awaiting_clarify",
      // Carried forward so a second clarify round still knows what was asked.
      originalPrompt,
      messages: outcome.messages,
      question: outcome.question,
      options: outcome.options,
      round: outcome.round,
    });
  } else {
    clearSession(db, chatId);
  }

  const view = outcomeView(outcome);
  // The paywall message is only useful with something to buy attached.
  const keyboard = outcome.status === "needs_purchase" ? (offersKeyboard(db, chatId) ?? undefined) : view.keyboard;
  await ctx.api
    .editMessageText(chatId, placeholder.message_id, view.text, { parse_mode: "HTML", reply_markup: keyboard })
    .catch(async () => {
      await ctx.reply(view.text, { parse_mode: "HTML", reply_markup: keyboard });
    });
}

/** Entry point shared by /ai, the menu button and the search screen's AI button. */
export async function performGeneration(ctx: BotContext, db: AppDb, rawPrompt: string): Promise<void> {
  const chatId = ctx.chat!.id;
  const prompt = rawPrompt.trim().slice(0, 500);
  if (!prompt) {
    setPendingInput(db, chatId, "awaiting_prompt");
    const view = generatePromptView();
    await ctx.reply(view.text, { parse_mode: "HTML", reply_markup: view.keyboard });
    return;
  }
  await runWithProgress(ctx, db, prompt, (onEvent) => startGeneration(db, chatId, prompt, onEvent));
}

export function registerGenerate(bot: Bot<BotContext>, db: AppDb): void {
  bot.command("ai", async (ctx) => {
    await performGeneration(ctx, db, ctx.match ?? "");
  });

  bot.callbackQuery("nav:generate", async (ctx) => {
    ackCallback(ctx);
    const chatId = ctx.chat!.id;
    setPendingInput(db, chatId, "awaiting_prompt");
    const view = generatePromptView();
    await ctx.editMessageText(view.text, { parse_mode: "HTML", reply_markup: view.keyboard }).catch(async () => {
      await ctx.reply(view.text, { parse_mode: "HTML", reply_markup: view.keyboard });
    });
  });

  bot.callbackQuery(/^gen:cl:(\d+)$/, async (ctx) => {
    const chatId = ctx.chat!.id;
    const pending = getPendingClarify(db, chatId);
    const answer = pending?.options[Number(ctx.match[1])];
    if (!pending || !answer) {
      await ctx.answerCallbackQuery("Запрос устарел, начните заново");
      return;
    }
    ackCallback(ctx);
    await runWithProgress(ctx, db, pending.originalPrompt, (onEvent) =>
      resumeGeneration(db, chatId, pending.originalPrompt, pending.messages, answer, pending.round, onEvent),
    );
  });

  bot.callbackQuery(/^gen:dl:(\d+)$/, async (ctx) => {
    const chatId = ctx.chat!.id;
    if (hasActiveDownload(db, chatId)) {
      await ctx.answerCallbackQuery("Загрузка уже идёт, дождитесь завершения");
      return;
    }
    const generation = getGeneration(db, chatId, Number(ctx.match[1]));
    if (!generation || generation.tracks.length === 0) {
      await ctx.answerCallbackQuery("Плейлист не найден");
      return;
    }
    await ctx.answerCallbackQuery("Отправляю…");
    const record = insertDownload(
      db,
      chatId,
      generation.playlistName ?? generation.prompt,
      generation.tracks.map(({ uri, title, artist, durationMs, artwork }) => ({
        uri,
        title,
        artist,
        durationMs,
        artwork,
      })),
    );
    void processDownload(db, record, createRuntimeAudioDeps(ctx.api)).catch((e) => {
      console.error(`bot generate download job ${record.id} crashed:`, e);
    });
  });
}
