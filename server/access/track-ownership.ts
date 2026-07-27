import type { AppDb } from "../db";

/**
 * Whether this chat already holds the track somewhere in its own library —
 * saved tracks, a user playlist, or any past generation.
 *
 * Playback is gated on this rather than on `hasAccess` alone: a user whose
 * credits ran out should still be able to listen to the playlists they already
 * paid to generate. Only streaming something they have never generated or
 * saved requires live entitlement.
 *
 * The generations arm uses json_each rather than a LIKE over tracks_json on
 * purpose — track URIs can contain `_`, which LIKE would treat as a wildcard
 * and over-match.
 */
export function ownsTrack(db: AppDb, chatId: number, uri: string): boolean {
  const saved = db
    .query<{ n: number }, [number, string]>(`SELECT 1 AS n FROM saved_tracks WHERE chat_id = ? AND uri = ? LIMIT 1`)
    .get(chatId, uri);
  if (saved) return true;

  const inPlaylist = db
    .query<{ n: number }, [number, string]>(
      `SELECT 1 AS n
       FROM playlist_tracks pt
       JOIN playlists p ON p.id = pt.playlist_id
       WHERE p.chat_id = ? AND pt.uri = ? LIMIT 1`,
    )
    .get(chatId, uri);
  if (inPlaylist) return true;

  const generated = db
    .query<{ n: number }, [number, string]>(
      `SELECT 1 AS n
       FROM generations g, json_each(g.tracks_json)
       WHERE g.chat_id = ?
         AND g.tracks_json IS NOT NULL
         AND json_extract(json_each.value, '$.uri') = ?
       LIMIT 1`,
    )
    .get(chatId, uri);
  return generated !== null;
}
