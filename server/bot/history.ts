import { Bot, InlineKeyboard } from "grammy";
import type { AppDb } from "../db";
import type { BotContext } from "./context";
import { listDownloads, getDownload, insertDownload, hasActiveDownload, type DownloadRecord } from "../audio/downloads-store";
import { processDownload } from "../audio/deliver";
import { createTelegramAudioSender } from "../audio/telegram-sender";
import { YtDlpExtractor } from "../audio/extractor";
import { env } from "../env";
import { btnText, heading } from "./emoji";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar-day key (local time) for grouping, derived from a unix-seconds timestamp. */
function epochDay(createdAt: number): number {
  const d = new Date(createdAt * 1000);
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(local.getTime() / DAY_MS);
}

function formatDay(day: number): string {
  return new Date(day * DAY_MS).toLocaleDateString("ru-RU");
}

function formatTime(createdAt: number): string {
  return new Date(createdAt * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

interface DatesView {
  text: string;
  keyboard: InlineKeyboard | undefined;
}

function buildDatesView(records: DownloadRecord[]): DatesView {
  if (records.length === 0) {
    return {
      text: `${heading("info", "История загрузок пуста.")}\n\nСгенерируй плейлист в мини-приложении, чтобы она появилась здесь.`,
      keyboard: undefined,
    };
  }

  const byDay = new Map<number, DownloadRecord[]>();
  for (const r of records) {
    const day = epochDay(r.createdAt);
    const list = byDay.get(day) ?? [];
    list.push(r);
    byDay.set(day, list);
  }

  const kb = new InlineKeyboard();
  for (const [day, items] of byDay) {
    const label = `${formatDay(day)} (${items.length})`;
    kb.text(btnText(label, "history"), `hist:date:${day}`).row();
  }

  return { text: `<b>${heading("music", "ИСТОРИЯ")}</b>\n\nВыбери дату, чтобы скачать плейлист заново:`, keyboard: kb };
}

interface PlaylistsView {
  text: string;
  keyboard: InlineKeyboard;
}

function buildPlaylistsView(day: number, items: DownloadRecord[]): PlaylistsView {
  const kb = new InlineKeyboard();
  for (const r of items) {
    const label = `${formatTime(r.createdAt)} — ${r.playlistName}`;
    kb.text(btnText(label, "music"), `hist:dl:${r.id}`).row();
  }
  kb.text(btnText("Назад", "back"), "hist:back");
  return { text: `<b>${heading("music", formatDay(day))}</b>\n\nВыбери плейлист для скачивания:`, keyboard: kb };
}

export async function showHistory(ctx: BotContext, db: AppDb): Promise<void> {
  const chatId = ctx.chat!.id;
  const records = listDownloads(db, chatId);
  const view = buildDatesView(records);
  await ctx.reply(view.text, { parse_mode: "HTML", reply_markup: view.keyboard });
}

/** History view for in-place navigation: dates view + «Назад» to the /start menu. */
export function buildHistoryView(db: AppDb, chatId: number): { text: string; keyboard: InlineKeyboard } {
  const view = buildDatesView(listDownloads(db, chatId));
  const kb = view.keyboard ?? new InlineKeyboard();
  kb.row().text(btnText("Назад", "back"), "nav:menu");
  return { text: view.text, keyboard: kb };
}

async function resendDownload(ctx: BotContext, db: AppDb, chatId: number, id: number): Promise<void> {
  const record = getDownload(db, chatId, id);
  if (!record) {
    await ctx.answerCallbackQuery("Загрузка не найдена");
    return;
  }
  if (hasActiveDownload(db, chatId)) {
    await ctx.answerCallbackQuery("Загрузка уже идёт, дождитесь завершения");
    return;
  }

  await ctx.answerCallbackQuery("Отправляю…");
  const fresh = insertDownload(
    db,
    chatId,
    record.playlistName,
    record.tracks.map(({ uri, title, artist, durationMs }) => ({ uri, title, artist, durationMs })),
  );

  void processDownload(db, fresh, {
    sender: createTelegramAudioSender(ctx.api),
    extractor: new YtDlpExtractor(),
    scratchDir: env.audioScratchDir,
  }).catch((e) => {
    console.error(`history resend job ${fresh.id} crashed:`, e);
  });
}

export function registerHistory(bot: Bot<BotContext>, db: AppDb): void {
  bot.command("history", async (ctx) => {
    await showHistory(ctx, db);
  });

  bot.callbackQuery("hist:back", async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat!.id;
    const view = buildDatesView(listDownloads(db, chatId));
    await ctx.editMessageText(view.text, { parse_mode: "HTML", reply_markup: view.keyboard });
  });

  bot.callbackQuery(/^hist:date:(\d+)$/, async (ctx) => {
    const day = Number(ctx.match[1]);
    const chatId = ctx.chat!.id;
    const items = listDownloads(db, chatId).filter((r) => epochDay(r.createdAt) === day);

    if (items.length === 0) {
      await ctx.answerCallbackQuery("Ничего не найдено за эту дату");
      return;
    }

    if (items.length === 1) {
      await resendDownload(ctx, db, chatId, items[0]!.id);
      return;
    }

    await ctx.answerCallbackQuery();
    const view = buildPlaylistsView(day, items);
    await ctx.editMessageText(view.text, { parse_mode: "HTML", reply_markup: view.keyboard });
  });

  bot.callbackQuery(/^hist:dl:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const chatId = ctx.chat!.id;
    await resendDownload(ctx, db, chatId, id);
  });
}
