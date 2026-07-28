import type { AppDb } from "../db";
import type { TrackMeta } from "./alternate-source";

/**
 * Title/artist for a uri, dug out of wherever this chat already has the track.
 *
 * Only the fallback path needs this: the Mini App sends the metadata it is
 * already displaying along with the stream request, and this covers everything
 * else (the bot, an old client, a direct Range request from a media session
 * that kept the bare URL).
 */
export function lookupTrackMeta(db: AppDb, chatId: number, uri: string): TrackMeta | null {
  const cached = db
    .query<{ title: string; artist: string; duration_ms: number | null }, [string]>(
      `SELECT title, artist, duration_ms FROM audio_cache WHERE uri = ?`,
    )
    .get(uri);
  if (cached) {
    return { title: cached.title, artist: cached.artist, durationMs: cached.duration_ms ?? undefined };
  }

  const saved = db
    .query<{ title: string; artist: string }, [number, string]>(
      `SELECT title, artist FROM saved_tracks WHERE chat_id = ? AND uri = ?`,
    )
    .get(chatId, uri);
  if (saved) return { title: saved.title, artist: saved.artist };

  const inPlaylist = db
    .query<{ title: string; artist: string }, [number, string]>(
      `SELECT pt.title AS title, pt.artist AS artist
       FROM playlist_tracks pt
       JOIN playlists p ON p.id = pt.playlist_id
       WHERE p.chat_id = ? AND pt.uri = ? LIMIT 1`,
    )
    .get(chatId, uri);
  if (inPlaylist) return { title: inPlaylist.title, artist: inPlaylist.artist };

  // Same json_each shape as ownsTrack: URIs contain `_`, which LIKE would
  // treat as a wildcard.
  const generated = db
    .query<{ title: string | null; artist: string | null; duration_ms: number | null }, [number, string]>(
      `SELECT json_extract(json_each.value, '$.title') AS title,
              json_extract(json_each.value, '$.artist') AS artist,
              json_extract(json_each.value, '$.durationMs') AS duration_ms
       FROM generations g, json_each(g.tracks_json)
       WHERE g.chat_id = ?
         AND g.tracks_json IS NOT NULL
         AND json_extract(json_each.value, '$.uri') = ?
       LIMIT 1`,
    )
    .get(chatId, uri);
  if (generated?.title) {
    return {
      title: generated.title,
      artist: generated.artist ?? "",
      durationMs: generated.duration_ms ?? undefined,
    };
  }

  return null;
}
