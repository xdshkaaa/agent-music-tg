import type { HistoryEntry, LibraryTrack, SuggestedArtist, SuggestionsResponse } from "./api";

/**
 * Selection logic for the create/search empty states.
 *
 * It lives here rather than in the screen components because the Mini App has
 * no DOM test setup — pure functions in `src/lib` are the only thing the suite
 * can cover, so anything with rules worth protecting belongs here.
 */

// --- Recent searches (localStorage) ----------------------------------------

const RECENT_KEY = "miniapp-recent-searches";
export const RECENT_MAX = 8;

export function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function pushRecentSearch(query: string): string[] {
  const q = query.trim();
  if (!q) return loadRecentSearches();
  const next = [q, ...loadRecentSearches().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage can be full or blocked; the in-memory list still updates.
  }
  return next;
}

// --- Prompt examples --------------------------------------------------------

export const PROMPT_EXAMPLE_COUNT = 5;

export const PROMPT_EXAMPLES = [
  "Спокойный инди для вечерней прогулки",
  "Фокус без вокала",
  "Энергичная музыка для тренировки",
  "Неоновая электроника для ночной дороги",
  "Джаз для дождливого утра",
  "Русский рок для поездки за город",
  "Тёплый соул для ужина вдвоём",
  "Танцевальные хиты нулевых",
  "Мрачный постпанк для ночной прогулки",
  "Музыка как саундтрек к космосу",
  "Лёгкий фон для чтения",
  "Бодрый поп для уборки",
  "Что-нибудь похожее на Radiohead",
  "Женский вокал и дрим-поп",
  "Тихая классика перед сном",
  "Латино для домашней вечеринки",
  "Диско и фанк для хорошего настроения",
  "Хип-хоп с расслабленным битом",
  "Саундтрек для рабочего дедлайна",
  "Акустика для вечера у костра",
] as const;

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/**
 * Picks fresh example prompts, avoiding whatever was just on screen so the
 * "Ещё" button visibly changes something.
 *
 * `artists` seeds a couple of personalized entries — the user's own top artists
 * make far better starting points than generic copy, and they are the reason
 * this needs to know about the suggestions payload at all.
 */
export function samplePromptExamples(previous: readonly string[] = [], artists: SuggestedArtist[] = []): string[] {
  const previousSet = new Set(previous);
  const personalized = shuffled(artists.map((a) => `Что-нибудь похожее на ${a.name}`)).filter(
    (p) => !previousSet.has(p),
  );
  const generic = shuffled(PROMPT_EXAMPLES.filter((e) => !previousSet.has(e)));

  // At most two personalized slots: the rail should still feel like a range of
  // ideas, not a list of the same few artists.
  const picked = [...personalized.slice(0, 2), ...generic];
  if (picked.length >= PROMPT_EXAMPLE_COUNT) return picked.slice(0, PROMPT_EXAMPLE_COUNT);
  // Everything was excluded as "previous" — fall back to a plain reshuffle
  // rather than returning a short (or empty) rail.
  return shuffled([...PROMPT_EXAMPLES]).slice(0, PROMPT_EXAMPLE_COUNT);
}

// --- Screen feeds -----------------------------------------------------------

export const EMPTY_SUGGESTIONS: SuggestionsResponse = {
  recentGenerations: [],
  topArtists: [],
  libraryTracks: [],
  genres: [],
};

export interface PromptFeed {
  /** Recent playlists to resume, newest first. Empty for a new user. */
  resume: HistoryEntry[];
  /** Example prompts, personalized where possible. */
  examples: string[];
}

/** Generations with no tracks cannot render a cover, so they are not offered. */
export function buildPromptFeed(data: SuggestionsResponse, examples: string[], limit = 6): PromptFeed {
  return {
    resume: data.recentGenerations.filter((g) => g.tracks.length > 0).slice(0, limit),
    examples,
  };
}

export interface SearchFeed {
  recent: string[];
  artists: SuggestedArtist[];
  tracks: LibraryTrack[];
  genres: string[];
}

/**
 * Search-mode empty state. Genres are shown only when the personal sections
 * cannot fill the screen on their own — for an established user they would just
 * be noise below their own library.
 */
export function buildSearchFeed(data: SuggestionsResponse, recent: string[]): SearchFeed {
  const artists = data.topArtists.slice(0, 8);
  const tracks = data.libraryTracks.slice(0, 6);
  const hasPersonal = artists.length > 0 || tracks.length > 0;
  return {
    recent,
    artists,
    tracks,
    genres: hasPersonal ? [] : data.genres,
  };
}

/** True when there is nothing at all to render below the input. */
export function isSearchFeedEmpty(feed: SearchFeed): boolean {
  return (
    feed.recent.length === 0 && feed.artists.length === 0 && feed.tracks.length === 0 && feed.genres.length === 0
  );
}
