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

  /** Free-text search returning up to `limit` candidate albums for a phrase. */
  searchAlbums(query: string, limit?: number): Promise<Album[]>;
  /** Returns the tracks belonging to a resolved album. */
  getAlbumTracks(albumId: string, limit?: number): Promise<Track[]>;

  // Present only when capabilities.remotePlaylists:
  createPlaylist?(name: string, description?: string): Promise<RemotePlaylist>;
  addTracksToPlaylist?(playlistId: string, uris: string[]): Promise<void>;
}
