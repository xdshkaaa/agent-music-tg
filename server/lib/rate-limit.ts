/**
 * Per-chat sliding-window throttle, shared across transports.
 *
 * The music-search and audio-stream endpoints have no LLM or credit gate of
 * their own, so this is their only guard against backend scraping and against
 * spawning unbounded yt-dlp processes. A limiter must therefore be keyed by
 * chat and shared between every entry point that reaches the same backend —
 * otherwise a caller simply spends the budget twice by switching from the Mini
 * App to the bot.
 */
export interface RateLimiter {
  /** Records a hit and reports whether the caller has exceeded the window. */
  check(chatId: number): boolean;
  /** Drops all recorded state — for tests. */
  reset(): void;
}

export interface RateLimiterOptions {
  /** Hits allowed inside one window. */
  limit: number;
  windowMs: number;
  /**
   * Defensive cap on distinct chats held in memory, so sustained abuse from
   * many chat IDs cannot grow the map without bound.
   */
  maxChats?: number;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { limit, windowMs } = options;
  const maxChats = options.maxChats ?? 5_000;
  const clock = options.now ?? Date.now;
  const hits = new Map<number, number[]>();

  return {
    check(chatId: number): boolean {
      const now = clock();
      const recent = (hits.get(chatId) ?? []).filter((t) => now - t < windowMs);
      if (recent.length === 0) {
        // No recent activity — evict instead of leaving a stale empty entry, so
        // the map stays bounded by active chats rather than chats ever seen.
        hits.delete(chatId);
      } else {
        hits.set(chatId, recent);
      }
      if (recent.length >= limit) return true;
      if (hits.size >= maxChats) {
        // Evict the oldest-inserted entry (Map preserves insertion order).
        const oldest = hits.keys().next().value;
        if (oldest !== undefined) hits.delete(oldest);
      }
      recent.push(now);
      hits.set(chatId, recent);
      return false;
    },
    reset(): void {
      hits.clear();
    },
  };
}

/**
 * Free-text music search (Mini App `/api/search*` and the bot's `/search`).
 * One budget per chat regardless of which surface issued the query.
 */
export const searchRateLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

/**
 * In-app playback resolves an upstream URL with yt-dlp on a cache miss, so an
 * unthrottled caller looping distinct track URIs spawns one process each. The
 * ceiling is generous because a normal listening session legitimately walks
 * through many tracks, and cache hits never reach the limiter.
 */
export const streamRateLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 });
