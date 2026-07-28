import { createMusicProvider } from "../music/registry";
import type { MusicBackend, Track } from "../music/types";

/**
 * Finds the same song on a *different* music backend.
 *
 * Used as a silent repair for playback: a YouTube video pulled for copyright
 * or a dead SoundCloud id leaves the track unplayable at its own source, but
 * the song itself is almost always sitting on the other service. Rather than
 * telling the listener "не удалось воспроизвести", the stream route swaps in
 * that copy — same title, same artist, different platform.
 */

export interface TrackMeta {
  title: string;
  artist: string;
  durationMs?: number;
}

export interface AlternateFinder {
  /** Resolves to a playable uri on another backend, or null if nothing matches. */
  find(uri: string, meta: TrackMeta, options?: { exclude?: string[] }): Promise<string | null>;
}

const SCHEME_BY_BACKEND: Record<MusicBackend, string> = {
  soundcloud: "sc",
  "youtube-music": "ytm",
};

/** Backends to try, in order, for a uri from the given scheme. */
const ALTERNATES_BY_SCHEME: Record<string, MusicBackend[]> = {
  ytm: ["soundcloud"],
  sc: ["youtube-music"],
};

/**
 * The whole search runs while the listener is staring at a spinner, so it is
 * capped well below the backends' own timeouts: a fallback that takes ten
 * seconds is not meaningfully better than an error message.
 */
const FIND_TIMEOUT_MS = 7_000;
/** Extra candidates pulled only when the single best match fails validation. */
const CANDIDATE_LIMIT = 5;
/** Loosest accepted title overlap when the artist also matches. */
const MIN_TITLE_SCORE = 0.6;
const MIN_TITLE_SCORE_WITH_ARTIST = 0.4;
const MIN_ARTIST_SCORE = 0.5;
/** Guards against a 60-minute DJ mix answering a 3-minute song. */
const MAX_DURATION_DRIFT_MS = 45_000;

const NOISE_WORDS = new Set([
  "official", "video", "audio", "lyric", "lyrics", "hd", "hq", "remaster", "remastered",
  "feat", "ft", "prod", "version", "music", "mv", "full",
]);

function normalizeTokens(value: string): Set<string> {
  const cleaned = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ");
  const tokens = new Set<string>();
  for (const token of cleaned.split(" ")) {
    if (token.length > 1 && !NOISE_WORDS.has(token)) tokens.add(token);
  }
  return tokens;
}

/**
 * Containment score: how much of the smaller token set the other one covers.
 * Deliberately not Jaccard — "Song Name" vs "Song Name (Live at Wembley)"
 * is the same song, and asymmetric extra words are the norm across platforms.
 */
export function titleSimilarity(a: string, b: string): number {
  const left = normalizeTokens(a);
  const right = normalizeTokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / Math.min(left.size, right.size);
}

/** Whether `candidate` is close enough to `meta` to play in its place. */
export function matchesTrack(meta: TrackMeta, candidate: Track): boolean {
  const titleScore = titleSimilarity(meta.title, candidate.title);
  const artistScore = meta.artist ? titleSimilarity(meta.artist, candidate.artist) : 0;
  const titleOk =
    titleScore >= MIN_TITLE_SCORE ||
    (titleScore >= MIN_TITLE_SCORE_WITH_ARTIST && artistScore >= MIN_ARTIST_SCORE);
  if (!titleOk) return false;
  if (
    meta.durationMs != null &&
    candidate.durationMs != null &&
    Math.abs(meta.durationMs - candidate.durationMs) > MAX_DURATION_DRIFT_MS
  ) {
    return false;
  }
  return true;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

function schemeOf(uri: string): string {
  return uri.split(":")[0] ?? "";
}

export class MusicBackendAlternateFinder implements AlternateFinder {
  async find(uri: string, meta: TrackMeta, options: { exclude?: string[] } = {}): Promise<string | null> {
    if (!meta.title.trim()) return null;
    const backends = ALTERNATES_BY_SCHEME[schemeOf(uri)] ?? [];
    if (backends.length === 0) return null;
    const excluded = new Set([uri, ...(options.exclude ?? [])]);
    return withTimeout(this.search(backends, meta, excluded), FIND_TIMEOUT_MS, null);
  }

  private async search(backends: MusicBackend[], meta: TrackMeta, excluded: Set<string>): Promise<string | null> {
    for (const backend of backends) {
      const provider = createMusicProvider(backend);
      const scheme = SCHEME_BY_BACKEND[backend];
      const accept = (candidate: Track | null | undefined): string | null => {
        if (!candidate || excluded.has(candidate.uri)) return null;
        // A backend must only ever answer with its own scheme; anything else
        // means the same dead source coming back around.
        if (schemeOf(candidate.uri) !== scheme) return null;
        return matchesTrack(meta, candidate) ? candidate.uri : null;
      };

      try {
        // searchTrack is the cheap, already artist-aware path, and its result
        // is cached process-wide — repeats of a known-bad track cost nothing.
        const best = accept(await provider.searchTrack(meta.artist, meta.title));
        if (best) return best;

        const query = meta.artist ? `${meta.artist} ${meta.title}` : meta.title;
        for (const candidate of await provider.searchTracks(query, CANDIDATE_LIMIT)) {
          const uri = accept(candidate);
          if (uri) return uri;
        }
      } catch {
        // A backend being down just means the next one gets its turn.
      }
    }
    return null;
  }
}

export const alternateFinder: AlternateFinder = new MusicBackendAlternateFinder();
