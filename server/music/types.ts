export interface Track {
  /** Provider-specific URI: sc:12345 / ytm:videoId */
  uri: string;
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  artwork?: string;
  /** Present on resolve-only backends (SoundCloud/YouTube Music): open-in-app link. */
  deepLink?: string;
  /** Play count, when the backend reports one (SoundCloud only). */
  playbackCount?: number;
  /** Like count, when the backend reports one (SoundCloud only). */
  likeCount?: number;
}

export interface Album {
  /** Provider-specific URI: sc:12345 / ytm:albumId */
  uri: string;
  title: string;
  artist: string;
  artwork?: string;
  /** Present on resolve-only backends (SoundCloud/YouTube Music): open-in-app link. */
  deepLink?: string;
}

export interface ArtistCard {
  /** Provider-specific artist id (opaque; pass back verbatim to getArtistAlbums/getArtistTopTracks). */
  id: string;
  name: string;
  artwork?: string;
}

/**
 * Richer artist metadata for the Mini App's artist screen. Every field beyond
 * the ArtistCard base is optional because coverage differs per backend —
 * neither service exposes anything like Spotify's monthly listeners.
 */
export interface ArtistDetails extends ArtistCard {
  /** YouTube Music: subscribers. SoundCloud: followers. */
  followers?: number;
  description?: string;
}

export interface RemotePlaylist {
  id: string;
  uri: string;
  url?: string;
  name: string;
}

export interface ProviderCapabilities {
  /** Can create playlists on the service side. */
  remotePlaylists: boolean;
  /** Remote playback controlled via the service's API. */
  remotePlayback: boolean;
}

export type MusicBackend = "soundcloud" | "youtube-music";

export interface MusicProvider {
  readonly name: MusicBackend;
  readonly capabilities: ProviderCapabilities;

  searchTrack(artist: string, title: string): Promise<Track | null>;
  /** Free-text search returning up to `limit` candidate tracks for a whole phrase. */
  searchTracks(query: string, limit?: number): Promise<Track[]>;
  searchArtist(name: string): Promise<{ id: string; name: string } | null>;
  getArtistTopTracks(artistId: string, limit?: number): Promise<Track[]>;
  /** Free-text search returning up to `limit` candidate artist cards. */
  searchArtists(query: string, limit?: number): Promise<ArtistCard[]>;
  /** Latest albums for a resolved artist; empty when the backend has no such data. */
  getArtistAlbums(artistId: string, limit?: number): Promise<Album[]>;
  /**
   * Avatar, follower count and bio for a resolved artist. Optional: callers
   * must render the artist screen fine without it, and it returns null
   * whenever the backend has nothing to add.
   */
  getArtistDetails?(artistId: string): Promise<ArtistDetails | null>;

  /** Free-text search returning up to `limit` candidate albums for a phrase. */
  searchAlbums(query: string, limit?: number): Promise<Album[]>;
  /** Returns the tracks belonging to a resolved album. */
  getAlbumTracks(albumId: string, limit?: number): Promise<Track[]>;

  // Present only when capabilities.remotePlaylists:
  createPlaylist?(name: string, description?: string): Promise<RemotePlaylist>;
  addTracksToPlaylist?(playlistId: string, uris: string[]): Promise<void>;
}
