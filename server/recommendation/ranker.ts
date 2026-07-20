import type { Track } from "../music/types";
import type { GenreRecommendationContext } from "./genre-knowledge";
import { normalizeMusicText } from "./genre-knowledge";
import type { PreferenceSnapshot } from "./preferences";

export type TrackRanker = (tracks: Track[]) => Track[];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Creates a pure synchronous ranker from context computed before the loop. */
export function createTrackRanker(
  context: GenreRecommendationContext | null,
  preferences: PreferenceSnapshot,
): TrackRanker {
  const representativeArtists = new Set((context?.representativeArtists ?? []).map(normalizeMusicText));
  const genreTerms = (context ? [...context.genreNames, ...context.relatedGenres] : [])
    .map(normalizeMusicText)
    .filter((term) => term.length >= 4);

  return (tracks) => {
    const candidates = tracks.filter((track) => !preferences.dislikedUris.has(track.uri));
    if (candidates.length < 2) return candidates;

    const scored = candidates.map((track, index) => {
      const artist = normalizeMusicText(track.artist);
      const metadata = normalizeMusicText(`${track.artist} ${track.title} ${track.album ?? ""}`);
      let score = clamp(preferences.artistWeights.get(artist) ?? 0, -6, 6);
      if (representativeArtists.has(artist)) score += 4;
      if (genreTerms.some((term) => ` ${metadata} `.includes(` ${term} `))) score += 1.5;
      return { track, index, score };
    });

    if (scored.every((entry) => entry.score === 0)) return candidates;
    return scored
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((entry) => entry.track);
  };
}
