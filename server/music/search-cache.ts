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
const MAX_ENTRIES = 5_000;

class TtlCache<T> {
  private map = new Map<string, CacheEntry<T>>();

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
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
    this.map.set(key, { value, expiresAt: Date.now() + TTL_MS });
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
  const cached = searchTrackCache.get(key);
  if (cached !== undefined) return cached as T;
  const value = await fn();
  searchTrackCache.set(key, value);
  return value;
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
  const cached = searchTracksCache.get(key);
  if (cached !== undefined) return cached as T;
  const value = await fn();
  searchTracksCache.set(key, value);
  return value;
}
