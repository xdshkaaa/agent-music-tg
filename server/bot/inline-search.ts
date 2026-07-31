import type { Bot } from "grammy";
import type { InlineQueryResult } from "grammy/types";
import type { AppDb } from "../db";
import type { BotContext } from "./context";
import type { Track } from "../music/types";
import { runSearch } from "./search";
import { inlineSearchRateLimiter, inlineExtractRateLimiter } from "../lib/rate-limit";
import { withTimeout } from "../core/concurrency";
import { getCachedAudio } from "../audio/cache";
import type { DeliverDeps } from "../audio/deliver";
import { warmTrack } from "../audio/warm-cache";
import type { DownloadTrack } from "../audio/downloads-store";
import { createTelegramAudioSender } from "../audio/telegram-sender";
import { YtDlpExtractor } from "../audio/extractor";
import { env } from "../env";
import { bumpInlineSearch, bumpInlineTrack } from "../access/inline-usage-store";

/**
 * Inline search: "@bot <query>" typed in any chat — a DM, a group the bot was
 * never added to, anywhere Telegram lets you invoke an inline bot. Open to
 * everyone, same as the group keyword search, and for the same reason: a
 * search box with no results is worse than one that's technically gate-kept
 * but silently useless to most people who'd try it.
 *
 * Telegram requires an inline answer within a few seconds and only accepts
 * already-uploaded audio (`audio_file_id`) as a result — there is no way to
 * turn a text placeholder into playable audio after the fact. So a query
 * answers instantly from whatever `audio_cache` already has (shared with
 * groups, the Mini App, and /search), while a handful of cache misses are
 * warmed in the background (see warm-cache.ts) for the *next* identical
 * query to find. The cache is global, so popular tracks become instant for
 * everyone after the first person ever asks for them.
 */

const MIN_QUERY_LENGTH = 2;
/** Telegram allows up to 50; kept lower since every entry is checked against audio_cache synchronously. */
const MAX_RESULTS = 20;
/** How many cache misses to kick off extraction for per query — bounded so one query can't fan out unboundedly into the shared yt-dlp pool. */
const WARM_COUNT = 3;
/** ytmusic-api's own search timeout is 15s (server/music/youtube-backend.ts), well past Telegram's answer window — bail out and answer with nothing rather than let the query expire silently. */
const SEARCH_BUDGET_MS = 6_000;

function warmingButton() {
  return {
    text: "Готовлю треки — откройте приложение",
    web_app: { url: env.publicOrigin },
  };
}

/** In-flight warm jobs per query round, purely so tests can await them; production callers are fire-and-forget. */
const pendingWarmups: Promise<void>[] = [];
export async function __drainInlineSearchForTests(): Promise<void> {
  while (pendingWarmups.length > 0) {
    await Promise.all(pendingWarmups.splice(0, pendingWarmups.length));
  }
}

export function __resetInlineSearchForTests(): void {
  pendingWarmups.length = 0;
}

/**
 * Test seam: overrides the extractor/sender/scratchDir used for warming, so
 * tests can drive the real pipeline without spawning yt-dlp. Pass null to
 * restore the production deps.
 */
let deliverDepsOverride: DeliverDeps | null = null;
export function __setInlineSearchDepsForTests(deps: DeliverDeps | null): void {
  deliverDepsOverride = deps;
}

function toDownloadTrack(track: Track): DownloadTrack {
  return {
    uri: track.uri,
    title: track.title,
    artist: track.artist,
    durationMs: track.durationMs,
    artwork: track.artwork,
    status: "pending",
  };
}

export function registerInlineSearch(bot: Bot<BotContext>, db: AppDb): void {
  bot.on("inline_query", async (ctx) => {
    const userId = ctx.from.id;
    const query = ctx.inlineQuery.query.trim().slice(0, 200);

    if (query.length < MIN_QUERY_LENGTH) {
      await ctx.answerInlineQuery([], { cache_time: 0 }).catch(() => {});
      return;
    }

    if (inlineSearchRateLimiter.check(userId)) {
      await ctx.answerInlineQuery([], { cache_time: 0 }).catch(() => {});
      return;
    }

    let tracks: Track[];
    try {
      tracks = await withTimeout(runSearch(db, query), SEARCH_BUDGET_MS, []);
    } catch (e) {
      console.error("[inline search]", e);
      await ctx.answerInlineQuery([], { cache_time: 0 }).catch(() => {});
      return;
    }

    bumpInlineSearch(db, userId, ctx.from.username ?? null);

    const results: InlineQueryResult[] = [];
    const misses: DownloadTrack[] = [];
    for (const track of tracks.slice(0, MAX_RESULTS)) {
      const cached = getCachedAudio(db, track.uri);
      if (cached) {
        results.push({ type: "audio", id: track.uri, audio_file_id: cached.tgFileId });
      } else if (misses.length < WARM_COUNT) {
        misses.push(toDownloadTrack(track));
      }
    }

    await ctx
      .answerInlineQuery(results, {
        cache_time: 0, // the answer changes as the warm-up fills audio_cache
        is_personal: false, // the cache is shared across every user, same as audio_cache itself
        ...(misses.length > 0 ? { button: warmingButton() } : {}),
      })
      .catch(() => {
        // query_id can expire between the search and the answer — nothing to do
      });

    if (misses.length === 0) return;
    const storageChatId = env.audioStorageChatId;
    if (storageChatId === null) return;
    if (inlineExtractRateLimiter.check(userId)) return; // shared extraction pool guard, same as groupExtractRateLimiter

    const deps: DeliverDeps = deliverDepsOverride ?? {
      sender: createTelegramAudioSender(ctx.api),
      extractor: new YtDlpExtractor(),
      scratchDir: env.audioScratchDir,
    };
    const task = Promise.all(misses.map((track) => warmTrack(db, track, deps, storageChatId))).then(() => {});
    pendingWarmups.push(task);
  });

  bot.on("chosen_inline_result", (ctx) => {
    // Requires inline feedback enabled via @BotFather (/setinlinefeedback) —
    // harmless no-op if it isn't, since Telegram then never sends the update.
    bumpInlineTrack(db, ctx.from.id);
  });
}
