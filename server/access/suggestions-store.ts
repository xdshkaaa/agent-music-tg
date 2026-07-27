import type { AppDb } from "../db";

export interface SuggestedArtist {
  name: string;
  artwork: string | null;
}

export interface LibraryTrack {
  uri: string;
  title: string;
  artist: string;
  artwork: string | null;
}

interface ArtistRow {
  name: string;
  artwork: string | null;
  weight: number;
}

/**
 * Artists the user demonstrably likes, ranked by how deliberate the signal was:
 * saving a track to a playlist is a stronger statement than a track merely
 * landing in a generated list.
 *
 * This deliberately does not reuse buildPreferenceSnapshot: that returns
 * normalized keys for prompt-building and carries no display name or artwork,
 * which is exactly what a UI row needs.
 */
export function topArtistsForChat(db: AppDb, chatId: number, limit = 10): SuggestedArtist[] {
  const rows = db
    .query<ArtistRow, [number, number, number]>(
      `SELECT artist AS name,
              MAX(artwork) AS artwork,
              SUM(weight) AS weight
       FROM (
         SELECT artist, artwork, 3 AS weight
         FROM saved_tracks WHERE chat_id = ?
         UNION ALL
         SELECT pt.artist, pt.artwork, 4 AS weight
         FROM playlist_tracks pt
         JOIN playlists p ON p.id = pt.playlist_id
         WHERE p.chat_id = ?
       )
       WHERE artist <> ''
       GROUP BY artist
       ORDER BY weight DESC, name COLLATE NOCASE ASC
       LIMIT ?`,
    )
    .all(chatId, chatId, limit);
  return rows.map((row) => ({ name: row.name, artwork: row.artwork }));
}

/**
 * A sample of the user's own library, newest first, for the search screen's
 * empty state. Saved tracks and playlist tracks are both real "my music".
 */
export function libraryTracksForChat(db: AppDb, chatId: number, limit = 8): LibraryTrack[] {
  return db
    .query<LibraryTrack & { created_at: number }, [number, number, number]>(
      `SELECT uri, title, artist, artwork, created_at
       FROM (
         SELECT uri, title, artist, artwork, created_at
         FROM saved_tracks WHERE chat_id = ?
         UNION ALL
         SELECT pt.uri, pt.title, pt.artist, pt.artwork, pt.created_at
         FROM playlist_tracks pt
         JOIN playlists p ON p.id = pt.playlist_id
         WHERE p.chat_id = ?
       )
       GROUP BY uri
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(chatId, chatId, limit)
    .map((row) => ({ uri: row.uri, title: row.title, artist: row.artist, artwork: row.artwork }));
}
