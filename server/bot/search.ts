import { Bot, InlineKeyboard } from "grammy";
import type { AppDb } from "../db";
import { ackCallback, type BotContext } from "./context";
import type { Track } from "../music/types";
import { createMusicProvider, isMusicBackend } from "../music/registry";
import { getActiveBackendId } from "../lib/settings";
import { searchRateLimiter } from "../lib/rate-limit";
import { insertDownload, hasActiveDownload } from "../audio/downloads-store";
import { processDownload } from "../audio/deliver";
import { createTelegramAudioSender } from "../audio/telegram-sender";
import { YtDlpExtractor } from "../audio/extractor";
import { env } from "../env";
import { btnText } from "./emoji";
import { detailBlock, escapeHtml, messageHint, messageTitle, statusMessage } from "./message-format";
import { setPendingInput } from "./session";

const DEFAULT_BACKEND = "youtube-music";
export const PAGE_SIZE = 5;
const MAX_RESULTS = 30;
/** Telegram's hard limit on callback_data. */
export const CALLBACK_DATA_MAX_BYTES = 64;

/**
 * Last result set per chat, so pagination and the action buttons can address a
 * track by index.
 *
 * Track URIs are short, but a query is not, and callback_data caps at 64 bytes
 * — an index is the only thing that reliably fits. Results live in memory
 * rather than the session row because they are disposable: after a restart the
 * buttons simply ask the user to search again.
 */
interface SearchSession {
  query: string;
  tracks: Track[];
  at: number;
}

const SESSION_TTL_MS = 30 * 60_000;
const MAX_SESSIONS = 2_000;
const sessions = new Map<number, SearchSession>();

function putSession(chatId: number, session: SearchSession): void {
  if (sessions.size >= MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (oldest !== undefined) sessions.delete(oldest);
  }
  sessions.set(chatId, session);
}

function getSession(chatId: number): SearchSession | null {
  const found = sessions.get(chatId);
  if (!found) return null;
  if (Date.now() - found.at > SESSION_TTL_MS) {
    sessions.delete(chatId);
    return null;
  }
  return found;
}

/** Test seam: the module-level cache would otherwise leak between cases. */
export function __resetSearchSessionsForTests(): void {
  sessions.clear();
}

export interface SearchView {
  text: string;
  keyboard: InlineKeyboard;
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/** Clamps a requested page into range so a stale button can never 404. */
export function clampPage(page: number, total: number): number {
  return Math.min(Math.max(page, 0), pageCount(total) - 1);
}

function formatDuration(ms: number | undefined): string {
  if (!ms || ms <= 0) return "";
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return ` · ${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function buildSearchView(query: string, tracks: Track[], page: number): SearchView {
  const total = tracks.length;
  const current = clampPage(page, total);
  const start = current * PAGE_SIZE;
  const slice = tracks.slice(start, start + PAGE_SIZE);

  const lines = slice.map(
    (track, i) =>
      `${start + i + 1}. <b>${escapeHtml(track.title)}</b>\n    ${escapeHtml(track.artist)}${formatDuration(track.durationMs)}`,
  );

  const text = [
    messageTitle("search", `Поиск: ${query}`),
    "",
    detailBlock(lines),
    "",
    messageHint(`Страница ${current + 1} из ${pageCount(total)} · найдено ${total}`),
  ].join("\n");

  const kb = new InlineKeyboard();
  // One row per track keeps the labels readable; the number ties the button to
  // the numbered line above it.
  for (const [i, track] of slice.entries()) {
    const index = start + i;
    kb.text(btnText(`${index + 1}. ${track.title}`.slice(0, 40), "music"), `srch:dl:${index}`).row();
  }

  const pages = pageCount(total);
  if (pages > 1) {
    if (current > 0) kb.text(btnText("Назад", "back"), `srch:p:${current - 1}`);
    kb.text(`${current + 1}/${pages}`, "srch:noop");
    if (current < pages - 1) kb.text(btnText("Дальше", "search"), `srch:p:${current + 1}`);
    kb.row();
  }

  kb.text(btnText("Собрать AI-плейлист", "star"), "srch:ai").row();
  kb.text(btnText("В меню", "back"), "nav:menu");

  return { text, keyboard: kb };
}

export function emptySearchView(query: string): SearchView {
  return {
    text: statusMessage(
      "search",
      "Ничего не нашлось",
      `По запросу «${query}» ничего нет. Попробуйте другое название, имя исполнителя или альбом.`,
    ),
    keyboard: new InlineKeyboard().text(btnText("В меню", "back"), "nav:menu"),
  };
}

export function searchPromptView(): SearchView {
  return {
    text: `${messageTitle("search", "Поиск по каталогу")}\n${messageHint("Отправьте название трека, исполнителя или альбома.")}`,
    keyboard: new InlineKeyboard().text(btnText("В меню", "back"), "nav:menu"),
  };
}

async function runSearch(db: AppDb, query: string): Promise<Track[]> {
  const backendId = getActiveBackendId(db, DEFAULT_BACKEND);
  const music = createMusicProvider(isMusicBackend(backendId) ? backendId : DEFAULT_BACKEND);
  return music.searchTracks(query, MAX_RESULTS);
}

/** Runs a query and replies with the first page. Shared by the command and the prompt flow. */
export async function performSearch(ctx: BotContext, db: AppDb, rawQuery: string): Promise<void> {
  const chatId = ctx.chat!.id;
  const query = rawQuery.trim().slice(0, 200);
  if (!query) {
    const view = searchPromptView();
    setPendingInput(db, chatId, "awaiting_search");
    await ctx.reply(view.text, { parse_mode: "HTML", reply_markup: view.keyboard });
    return;
  }

  // Shared with the Mini App's /api/search, so the budget cannot be spent twice
  // by switching surfaces.
  if (searchRateLimiter.check(chatId)) {
    await ctx.reply(statusMessage("warning", "Слишком много запросов", "Подождите минуту и попробуйте снова."), {
      parse_mode: "HTML",
    });
    return;
  }

  let tracks: Track[];
  try {
    tracks = await runSearch(db, query);
  } catch (e) {
    console.error("[bot search]", e);
    await ctx.reply(statusMessage("warning", "Поиск недоступен", "Музыкальный сервис не отвечает. Попробуйте позже."), {
      parse_mode: "HTML",
    });
    return;
  }

  if (tracks.length === 0) {
    const view = emptySearchView(query);
    await ctx.reply(view.text, { parse_mode: "HTML", reply_markup: view.keyboard });
    return;
  }

  putSession(chatId, { query, tracks, at: Date.now() });
  const view = buildSearchView(query, tracks, 0);
  await ctx.reply(view.text, { parse_mode: "HTML", reply_markup: view.keyboard });
}

async function sendTrack(ctx: BotContext, db: AppDb, chatId: number, track: Track): Promise<void> {
  if (hasActiveDownload(db, chatId)) {
    await ctx.answerCallbackQuery("Загрузка уже идёт, дождитесь завершения");
    return;
  }
  await ctx.answerCallbackQuery("Отправляю…");
  const record = insertDownload(db, chatId, `${track.title} — ${track.artist}`, [
    {
      uri: track.uri,
      title: track.title,
      artist: track.artist,
      durationMs: track.durationMs,
      artwork: track.artwork,
    },
  ]);
  void processDownload(db, record, {
    sender: createTelegramAudioSender(ctx.api),
    extractor: new YtDlpExtractor(),
    scratchDir: env.audioScratchDir,
  }).catch((e) => {
    console.error(`bot search download job ${record.id} crashed:`, e);
  });
}

export function registerSearch(bot: Bot<BotContext>, db: AppDb, generate: (ctx: BotContext, prompt: string) => Promise<void>): void {
  bot.command("search", async (ctx) => {
    await performSearch(ctx, db, ctx.match ?? "");
  });

  bot.callbackQuery("nav:search", async (ctx) => {
    ackCallback(ctx);
    const chatId = ctx.chat!.id;
    setPendingInput(db, chatId, "awaiting_search");
    const view = searchPromptView();
    await ctx.editMessageText(view.text, { parse_mode: "HTML", reply_markup: view.keyboard }).catch(async () => {
      await ctx.reply(view.text, { parse_mode: "HTML", reply_markup: view.keyboard });
    });
  });

  // The page indicator is a label, not an action.
  bot.callbackQuery("srch:noop", (ctx) => ctx.answerCallbackQuery());

  bot.callbackQuery(/^srch:p:(\d+)$/, async (ctx) => {
    const session = getSession(ctx.chat!.id);
    if (!session) {
      await ctx.answerCallbackQuery("Результаты устарели, повторите поиск");
      return;
    }
    ackCallback(ctx);
    const view = buildSearchView(session.query, session.tracks, Number(ctx.match[1]));
    await ctx.editMessageText(view.text, { parse_mode: "HTML", reply_markup: view.keyboard }).catch(() => {
      // Editing to identical content throws; nothing to do.
    });
  });

  bot.callbackQuery(/^srch:dl:(\d+)$/, async (ctx) => {
    const chatId = ctx.chat!.id;
    const session = getSession(chatId);
    const track = session?.tracks[Number(ctx.match[1])];
    if (!track) {
      await ctx.answerCallbackQuery("Результаты устарели, повторите поиск");
      return;
    }
    await sendTrack(ctx, db, chatId, track);
  });

  bot.callbackQuery("srch:ai", async (ctx) => {
    const session = getSession(ctx.chat!.id);
    if (!session) {
      await ctx.answerCallbackQuery("Результаты устарели, повторите поиск");
      return;
    }
    ackCallback(ctx);
    await generate(ctx, session.query);
  });
}
