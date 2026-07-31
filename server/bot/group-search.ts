import type { NextFunction } from "grammy";
import type { AppDb } from "../db";
import type { BotContext } from "./context";
import type { Track } from "../music/types";
import { runSearch } from "./search";
import { searchRateLimiter, groupExtractRateLimiter } from "../lib/rate-limit";
import { getCachedAudio } from "../audio/cache";
import { deliverTrack, type DeliverDeps } from "../audio/deliver";
import type { DownloadTrack } from "../audio/downloads-store";
import { createTelegramAudioSender } from "../audio/telegram-sender";
import { YtDlpExtractor } from "../audio/extractor";
import { env } from "../env";
import { upsertGroupChat, markGroupLeft, bumpGroupSearch, bumpGroupTrack } from "../access/group-chats-store";
import { escapeHtml, messageTitle, statusMessage } from "./message-format";
import { accent } from "./emoji";

/**
 * Group-chat keyword search: "найти <query>" (also a bare @mention, for when
 * the bot's privacy mode is still enabled and it never sees plain text).
 * Unlike the private /search flow, this sends the first result directly — a
 * group is a shared space, not a personal session, so there is no per-user
 * results list to page through.
 *
 * Deliberately does NOT trigger on a reply to the bot's own message: replies
 * are as often conversational ("где?", "спасибо") as they are a new search,
 * and a false-positive search on an unrelated word is worse than making
 * users type "найти" or @mention the bot explicitly.
 *
 * Mounted *before* allowlistGate so a group never needs to be allowlisted and
 * never touches the private-chat machinery (users table, sessions, paywall).
 * A group is not a person: it gets no signup credits, no "new user" admin
 * alert, and is excluded from every user-facing metric — see
 * server/access/group-chats-store.ts for its own counters instead.
 */

const MAX_QUERY_LENGTH = 200;

function stripLeadingMention(text: string, botUsername: string | undefined): { rest: string; mentioned: boolean } {
  if (!botUsername) return { rest: text, mentioned: false };
  const re = new RegExp(`^@${botUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  if (!re.test(text)) return { rest: text, mentioned: false };
  return { rest: text.replace(re, "").trim(), mentioned: true };
}

/**
 * Extracts the search query from a group message, or null if the message
 * isn't a trigger. The keyword takes priority over a bare mention/reply so
 * "@bot найти X" and "найти X" behave the same once the mention is stripped.
 */
export function parseGroupQuery(text: string, botUsername: string | undefined): string | null {
  const { rest, mentioned } = stripLeadingMention(text.trim(), botUsername);

  // `\b` is ASCII-only in a non-unicode JS regex, so it never fires around
  // Cyrillic text — a lookahead on whitespace/end-of-string is used instead.
  const keywordMatch = /^найти(?=\s|$)/i.exec(rest);
  if (keywordMatch) {
    const query = rest.slice(keywordMatch[0].length).trim();
    return query.length > 0 ? query.slice(0, MAX_QUERY_LENGTH) : null;
  }

  if (mentioned) {
    return rest.length > 0 ? rest.slice(0, MAX_QUERY_LENGTH) : null;
  }

  return null;
}

/** Caption under every track sent into a group, linking back to the bot with attribution so an interested member can find it themselves. */
function trackCaption(botUsername: string | undefined): string | undefined {
  if (!botUsername) return undefined;
  const url = `https://t.me/${botUsername}?start=src_group-search`;
  const icon = accent("search");
  return `${icon ? icon + " " : ""}<a href="${escapeHtml(url)}">поиск музыки</a>`;
}

function groupHelpText(): string {
  return [
    messageTitle("search", "Поиск музыки в чате"),
    "",
    "Напишите «найти &lt;название трека&gt;» — пришлю первый подходящий результат прямо в чат.",
  ].join("\n");
}

/** In-flight extractions per chat+track, so a second "найти X" while the first is still downloading doesn't spawn a duplicate extract — the first send covers both. */
const inFlight = new Map<string, Promise<void>>();

/** Test seam: the module-level dedupe map would otherwise leak between cases. */
export function __resetGroupSearchForTests(): void {
  inFlight.clear();
  pendingSearches.length = 0;
}

/**
 * Every group-search call is fire-and-forget from the middleware (so a slow
 * extraction never blocks other messages in the same chat via
 * sequentialize), which means `bot.handleUpdate()` resolves before delivery
 * finishes. Tests await this instead of the update to observe the outcome.
 */
const pendingSearches: Promise<void>[] = [];
export async function __drainGroupSearchForTests(): Promise<void> {
  while (pendingSearches.length > 0) {
    await Promise.all(pendingSearches.splice(0, pendingSearches.length));
  }
}

/**
 * Test seam: overrides the extractor/sender/scratchDir used for delivery, so
 * tests can drive the real bot pipeline (handleUpdate) without spawning
 * yt-dlp or touching the default scratch directory. Pass null to restore the
 * production deps (a fresh YtDlpExtractor + grammY sender per call, as
 * before).
 */
let deliverDepsOverride: DeliverDeps | null = null;
export function __setGroupSearchDepsForTests(deps: DeliverDeps | null): void {
  deliverDepsOverride = deps;
}

async function performGroupSearch(ctx: BotContext, db: AppDb, chatId: number, query: string): Promise<void> {
  if (searchRateLimiter.check(chatId)) return; // silent — a warning in a group is worse than a miss

  let tracks: Track[];
  try {
    tracks = await runSearch(db, query);
  } catch (e) {
    console.error("[group search]", e);
    return;
  }

  if (tracks.length === 0) {
    await ctx
      .reply(statusMessage("search", "Ничего не нашлось", `По запросу «${query}» ничего нет.`), {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message!.message_id, allow_sending_without_reply: true },
      })
      .catch(() => {});
    return;
  }

  bumpGroupSearch(db, chatId);
  const top = tracks[0]!;
  const track: DownloadTrack = {
    uri: top.uri,
    title: top.title,
    artist: top.artist,
    durationMs: top.durationMs,
    artwork: top.artwork,
    status: "pending",
  };

  const dedupeKey = `${chatId}:${track.uri}`;
  const existing = inFlight.get(dedupeKey);
  if (existing) {
    // Someone already asked for this exact track and it's still being
    // fetched — the send in flight will reach the whole chat, no need for a
    // second extraction.
    await existing;
    return;
  }

  const cached = getCachedAudio(db, track.uri);
  const replyToMessageId = ctx.message!.message_id;

  const run = (async () => {
    let statusMessageId: number | undefined;
    if (!cached) {
      if (groupExtractRateLimiter.check(chatId)) return; // extraction pool is shared with paying users elsewhere
      try {
        const sent = await ctx.reply(
          `${messageTitle("search", "Ищу")}\n${escapeHtml(`${track.artist} — ${track.title}`)}`,
          { parse_mode: "HTML", reply_parameters: { message_id: replyToMessageId, allow_sending_without_reply: true } },
        );
        statusMessageId = sent.message_id;
      } catch {
        // couldn't post the status line — still worth trying the send
      }
    }

    try {
      const deps: DeliverDeps = deliverDepsOverride ?? {
        sender: createTelegramAudioSender(ctx.api),
        extractor: new YtDlpExtractor(),
        scratchDir: env.audioScratchDir,
      };
      await deliverTrack(db, chatId, track, deps, { replyToMessageId, caption: trackCaption(ctx.me.username) });
      bumpGroupTrack(db, chatId);
    } catch (e) {
      console.error(`group search delivery failed for ${track.uri} in chat ${chatId}:`, e);
      await ctx
        .reply(statusMessage("cross", "Не получилось скачать этот трек"), {
          parse_mode: "HTML",
          reply_parameters: { message_id: replyToMessageId, allow_sending_without_reply: true },
        })
        .catch(() => {});
    } finally {
      if (statusMessageId !== undefined) {
        await ctx.api.deleteMessage(chatId, statusMessageId).catch(() => {});
      }
    }
  })();

  inFlight.set(dedupeKey, run);
  try {
    await run;
  } finally {
    inFlight.delete(dedupeKey);
  }
}

async function handleMyChatMember(ctx: BotContext, db: AppDb): Promise<void> {
  const update = ctx.myChatMember;
  if (!update || update.new_chat_member.user.id !== ctx.me.id) return;
  const chatId = update.chat.id;
  const status = update.new_chat_member.status;
  if (status === "member" || status === "administrator") {
    const title = "title" in update.chat ? update.chat.title ?? null : null;
    upsertGroupChat(db, chatId, title, update.from?.id ?? null);
    await ctx.api.sendMessage(chatId, groupHelpText(), { parse_mode: "HTML" }).catch(() => {});
  } else if (status === "left" || status === "kicked") {
    markGroupLeft(db, chatId);
  }
}

async function handleGroupText(ctx: BotContext, db: AppDb): Promise<void> {
  const text = ctx.message?.text;
  if (text === undefined) return;
  const chatId = ctx.chat!.id;
  const trimmed = text.trim();

  if (trimmed.startsWith("/")) {
    const cmd = trimmed.slice(1).split(/[\s@]/)[0]?.toLowerCase();
    if (cmd === "start" || cmd === "help" || cmd === "search") {
      await ctx.reply(groupHelpText(), { parse_mode: "HTML" }).catch(() => {});
    }
    return;
  }

  const query = parseGroupQuery(trimmed, ctx.me.username);
  if (query === null) {
    // A bare mention with no query still deserves the hint.
    if (stripLeadingMention(trimmed, ctx.me.username).mentioned) {
      await ctx.reply(groupHelpText(), { parse_mode: "HTML" }).catch(() => {});
    }
    return;
  }

  const task = performGroupSearch(ctx, db, chatId, query).catch((e) => {
    console.error(`group search crashed in chat ${chatId}:`, e);
  });
  pendingSearches.push(task);
}

/**
 * Fully handles group/supergroup updates and never calls next() for them, so
 * they never reach allowlistGate or any private-chat handler. Every other
 * chat type passes straight through.
 */
export function groupGate(db: AppDb) {
  return async (ctx: BotContext, next: NextFunction) => {
    const chatType = ctx.chat?.type;
    if (chatType !== "group" && chatType !== "supergroup") {
      await next();
      return;
    }

    if (ctx.myChatMember) {
      await handleMyChatMember(ctx, db);
      return;
    }

    await handleGroupText(ctx, db);
  };
}
