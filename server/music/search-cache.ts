/**
 * Process-wide TTL cache for music search results, shared across all users'
 * generation runs (unlike the per-run cache in generate-playlist.ts). Popular
 * prompts repeat the same artist/title or query lookups constantly, so this
 * turns a slow remote search into a sub-millisecond hit on repeats.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const TTL_MS = 6 * 60 * 60 * 1000; // 6h — long enough to matter, short enough to avoid stale deep links
/**
 * Empty/null results get a much shorter life. A backend timeout resolves to the
 * same empty fallback as a genuine "nothing found" (see withTimeout in the
 * backends), so caching those for the full TTL would pin one transient upstream
 * stall to every user of that query for hours with no retry.
 */
const NEGATIVE_TTL_MS = 60_000;
const MAX_ENTRIES = 5_000;

function isNegative(value: unknown): boolean {
  return value === null || value === undefined || (Array.isArray(value) && value.length === 0);
}

/** Injectable clock so a test can cross a TTL boundary instead of waiting it out. */
let clock: () => number = Date.now;

class TtlCache<T> {
  private map = new Map<string, CacheEntry<T>>();
  /** Lookups already running, so concurrent misses share one upstream call. */
  private inflight = new Map<string, Promise<T>>();

  clear(): void {
    this.map.clear();
    this.inflight.clear();
  }

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < clock()) {
      this.map.delete(key);
      return undefined;
    }
    // Refresh recency for a simple LRU-ish eviction order.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.map.size >= MAX_ENTRIES) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    const ttl = isNegative(value) ? NEGATIVE_TTL_MS : TTL_MS;
    this.map.set(key, { value, expiresAt: clock() + ttl });
  }

  /**
   * Returns the cached value, or runs `fn` once for all concurrent callers of
   * the same key. Without the in-flight map, a burst of identical misses — a
   * generation fanning out track lookups, or many users on the same trending
   * query — each pays its own remote round-trip.
   */
  async resolve(key: string, fn: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    // Rejections are not cached: deleting the in-flight entry lets the next
    // caller retry instead of inheriting the failure.
    const run = fn()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, run);
    return run;
  }
}

const searchTrackCache = new TtlCache<unknown>();
const searchTracksCache = new TtlCache<unknown>();

function normalize(s: string): string {
  return s.normalize("NFKD").toLowerCase().trim();
}

/** Memoizes a per-(artist,title) lookup (e.g. searchTrack) across all requests. */
export async function withTrackCache<T>(
  backend: string,
  artist: string,
  title: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = `${backend}:${normalize(artist)}|${normalize(title)}`;
  return searchTrackCache.resolve(key, fn as () => Promise<unknown>) as Promise<T>;
}

/** Memoizes a free-text query lookup (e.g. searchTracks/searchArtists/searchAlbums) across all requests. */
export async function withQueryCache<T>(
  backend: string,
  kind: string,
  query: string,
  limit: number,
  fn: () => Promise<T>,
): Promise<T> {
  const key = `${backend}:${kind}:${normalize(query)}:${limit}`;
  return searchTracksCache.resolve(key, fn as () => Promise<unknown>) as Promise<T>;
}

/**
 * Test seams: the caches are module-level, so cases would otherwise leak into
 * each other, and a 60s negative TTL is not something a test can wait out.
 */
export function __resetSearchCacheForTests(now: (() => number) | null = null): void {
  clock = now ?? Date.now;
  searchTrackCache.clear();
  searchTracksCache.clear();
}
