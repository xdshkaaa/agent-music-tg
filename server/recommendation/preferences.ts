import type { AppDb } from "../db";
import { listRecentMusicFeedback } from "../access/music-feedback-store";
import { normalizeMusicText } from "./genre-knowledge";

export interface PreferenceSnapshot {
  /** Normalized artist -> bounded signed affinity. */
  artistWeights: Map<string, number>;
  dislikedUris: Set<string>;
  dislikedTracks: string[];
}

interface TrackSignalRow {
  uri: string;
  title: string;
  artist: string;
}

const MAX_ARTIST_WEIGHT = 12;

function addArtistWeight(weights: Map<string, number>, artist: string, delta: number): void {
  const key = normalizeMusicText(artist);
  if (!key) return;
  const next = Math.max(-MAX_ARTIST_WEIGHT, Math.min(MAX_ARTIST_WEIGHT, (weights.get(key) ?? 0) + delta));
  weights.set(key, next);
}

/**
 * Builds one bounded, reusable snapshot before the tool loop. All database I/O
 * happens here; candidate ranking itself is a pure in-memory operation.
 */
export function buildPreferenceSnapshot(db: AppDb, chatId: number): PreferenceSnapshot {
  const saved = db
    .query<TrackSignalRow, [number, number]>(
      `SELECT uri, title, artist FROM saved_tracks WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(chatId, 50);
  const playlisted = db
    .query<TrackSignalRow, [number, number]>(
      `SELECT pt.uri, pt.title, pt.artist
       FROM playlist_tracks pt
       JOIN playlists p ON p.id = pt.playlist_id
       WHERE p.chat_id = ?
       ORDER BY pt.created_at DESC LIMIT ?`,
    )
    .all(chatId, 50);
  const disliked = db
    .query<TrackSignalRow, [number, number]>(
      `SELECT uri, title, artist FROM track_reactions WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(chatId, 50);
  const feedback = listRecentMusicFeedback(db, chatId, 100);

  const artistWeights = new Map<string, number>();
  for (const track of saved) addArtistWeight(artistWeights, track.artist, 3);
  for (const track of playlisted) addArtistWeight(artistWeights, track.artist, 4);
  for (const row of feedback) {
    const positive = Math.min(6, row.playCompletedCount * 2) + Math.min(1.5, row.playStartedCount * 0.15);
    const negative = Math.min(5, row.skippedCount * 1.5);
    addArtistWeight(artistWeights, row.artist, positive - negative);
  }
  // Explicit dislikes are deliberately stronger than implicit playback data.
  for (const track of disliked) addArtistWeight(artistWeights, track.artist, -8);

  return {
    artistWeights,
    dislikedUris: new Set(disliked.map((track) => track.uri)),
    dislikedTracks: disliked.map((track) => `${track.artist} - ${track.title}`),
  };
}
