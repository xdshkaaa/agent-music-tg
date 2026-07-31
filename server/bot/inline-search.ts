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
import { __drainWarmQueueForTests, __resetWarmQueueForTests, enqueueWarmTracks } from "../audio/warm-queue";
import { warmTrack } from "../audio/warm-cache";
import type { DownloadTrack } from "../audio/downloads-store";
import { createRuntimeAudioDeps } from "../audio/runtime";
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
/** Keep the whole handler below Telegram's ~10s inline-answer deadline. */
const TOTAL_ANSWER_BUDGET_MS = 9_000;

function warmingButton() {
  return {
    text: "Готовлю треки — откройте приложение",
    web_app: { url: env.publicOrigin },
  };
}

/** Lets tests observe the shared fire-and-forget warming queue. */
export async function __drainInlineSearchForTests(): Promise<void> {
  await __drainWarmQueueForTests();
}

export function __resetInlineSearchForTests(): void {
  __resetWarmQueueForTests();
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
    const requestStart = performance.now();
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

    let results: InlineQueryResult[] = [];
    const misses: DownloadTrack[] = [];
    for (const track of tracks.slice(0, MAX_RESULTS)) {
      const cached = getCachedAudio(db, track.uri);
      if (cached) {
        results.push({ type: "audio", id: track.uri, audio_file_id: cached.tgFileId });
      } else if (misses.length < WARM_COUNT) {
        misses.push(toDownloadTrack(track));
      }
    }

    const storageChatId = env.audioStorageChatId;
    let mayWarm = false;
    let deps: DeliverDeps | undefined;

    // A completely cold query used to return only “Готовлю треки”, forcing
    // the user to erase/retype the query. Instead, spend the remaining inline
    // answer window preparing the first few Telegram file_ids and include
    // whichever ones finish in this very answer. Existing cache hits still
    // answer immediately, so popular queries never pay this latency.
    if (results.length === 0 && misses.length > 0 && storageChatId !== null) {
      mayWarm = !inlineExtractRateLimiter.check(userId);
      if (mayWarm) {
        deps = deliverDepsOverride ?? createRuntimeAudioDeps(ctx.api);
        const remainingMs = Math.max(0, TOTAL_ANSWER_BUDGET_MS - (performance.now() - requestStart));
        if (remainingMs > 0) {
          await withTimeout(
            Promise.all(misses.map((track) => warmTrack(db, track, deps!, storageChatId))),
            remainingMs,
            [],
          );
        }
        results = tracks.slice(0, MAX_RESULTS).flatMap<InlineQueryResult>((track) => {
          const cached = getCachedAudio(db, track.uri);
          return cached ? [{ type: "audio", id: track.uri, audio_file_id: cached.tgFileId }] : [];
        });
      }
    }

    const unresolved = misses.filter((track) => !getCachedAudio(db, track.uri));
    await ctx
      .answerInlineQuery(results, {
        cache_time: 0, // the answer changes as the warm-up fills audio_cache
        is_personal: false, // the cache is shared across every user, same as audio_cache itself
        ...(unresolved.length > 0 ? { button: warmingButton() } : {}),
      })
      .catch(() => {
        // query_id can expire between the search and the answer — nothing to do
      });

    if (unresolved.length === 0) return;
    if (storageChatId === null) return;
    if (!mayWarm && inlineExtractRateLimiter.check(userId)) return; // shared extraction pool guard, same as groupExtractRateLimiter

    deps ??= deliverDepsOverride ?? createRuntimeAudioDeps(ctx.api);
    enqueueWarmTracks(db, unresolved, deps, storageChatId, WARM_COUNT);
  });

  bot.on("chosen_inline_result", (ctx) => {
    // Requires inline feedback enabled via @BotFather (/setinlinefeedback) —
    // harmless no-op if it isn't, since Telegram then never sends the update.
    bumpInlineTrack(db, ctx.from.id);
  });
}
