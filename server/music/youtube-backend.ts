import type { Album, ArtistCard, MusicProvider, ProviderCapabilities, Track } from "./types";
import { withTimeout } from "../core/concurrency";

const SEARCH_TIMEOUT_MS = 15_000;

interface YtmApi {
  searchSongs(query: string): Promise<any[]>;
  searchArtists(query: string): Promise<any[]>;
  getArtistSongs(artistId: string): Promise<any[]>;
  getArtistAlbums(artistId: string): Promise<any[]>;
  searchAlbums(query: string): Promise<any[]>;
  getAlbum(albumId: string): Promise<any>;
}

function normalizeName(s: string): string {
  return s.normalize("NFKD").toLowerCase().trim();
}

function toTrack(song: any): Track {
  const videoId = song.videoId;
  return {
    uri: `ytm:${videoId}`,
    title: song.name,
    artist: song.artist?.name ?? "",
    album: song.album?.name ?? undefined,
    durationMs: song.duration != null ? song.duration * 1000 : undefined,
    artwork: song.thumbnails?.at(-1)?.url,
    deepLink: `https://music.youtube.com/watch?v=${videoId}`,
  };
}

/**
 * Resolve-only YouTube Music backend (per design.md): search via ytmusic-api,
 * no local playback device on a VPS, so tracks carry a deep link instead of a
 * playable URL, and there is no createPlaylist/addTracksToPlaylist.
 */
export class YouTubeMusicBackend implements MusicProvider {
  readonly name = "youtube-music" as const;
  readonly capabilities: ProviderCapabilities = {
    remotePlaylists: false,
    remotePlayback: false,
  };

  private api: YtmApi | null = null;

  private async ensureApi(): Promise<YtmApi> {
    if (this.api) return this.api;
    const { default: YTMusic } = await import("ytmusic-api");
    const api = new YTMusic();
    await api.initialize();
    this.api = api as unknown as YtmApi;
    return this.api;
  }

  async searchTrack(artist: string, title: string): Promise<Track | null> {
    const api = await this.ensureApi();
    const songs = await withTimeout(api.searchSongs(`${artist} ${title}`), SEARCH_TIMEOUT_MS, [] as any[]);
    const want = normalizeName(artist);
    const match =
      songs.find((s) => {
        const got = normalizeName(s.artist?.name ?? "");
        return got === want || got.includes(want) || want.includes(got);
      }) ?? songs[0];
    return match ? toTrack(match) : null;
  }

  async searchTracks(query: string, limit = 10): Promise<Track[]> {
    const api = await this.ensureApi();
    const songs = await withTimeout(api.searchSongs(query), SEARCH_TIMEOUT_MS, [] as any[]);
    return songs.slice(0, limit).map(toTrack);
  }

  async searchArtist(name: string): Promise<{ id: string; name: string } | null> {
    const api = await this.ensureApi();
    const artists = await api.searchArtists(name);
    const item = artists[0];
    return item?.artistId ? { id: item.artistId, name: item.name } : null;
  }

  async getArtistTopTracks(artistId: string, limit = 5): Promise<Track[]> {
    const api = await this.ensureApi();
    const songs = await api.getArtistSongs(artistId);
    return songs.slice(0, limit).map(toTrack);
  }

  async searchArtists(query: string, limit = 5): Promise<ArtistCard[]> {
    const api = await this.ensureApi();
    const artists = await withTimeout(api.searchArtists(query), SEARCH_TIMEOUT_MS, [] as any[]);
    return artists.slice(0, limit).map((a: any) => ({
      id: a.artistId,
      name: a.name,
      artwork: a.thumbnails?.at(-1)?.url,
    }));
  }

  async getArtistAlbums(artistId: string, limit = 10): Promise<Album[]> {
    const api = await this.ensureApi();
    const albums = await withTimeout(api.getArtistAlbums(artistId), SEARCH_TIMEOUT_MS, [] as any[]);
    return albums.slice(0, limit).map((a: any) => ({
      uri: `ytm:album:${a.albumId}`,
      title: a.name,
      artist: a.artist?.name ?? "",
      artwork: a.thumbnails?.at(-1)?.url,
      deepLink: `https://music.youtube.com/browse/MPREb_${a.albumId}`,
    }));
  }

  async searchAlbums(query: string, limit = 10): Promise<Album[]> {
    const api = await this.ensureApi();
    const albums = await withTimeout(api.searchAlbums(query), SEARCH_TIMEOUT_MS, [] as any[]);
    return albums.slice(0, limit).map((a: any) => ({
      uri: `ytm:album:${a.albumId}`,
      title: a.name,
      artist: a.artist?.name ?? "",
      artwork: a.thumbnails?.at(-1)?.url,
      deepLink: `https://music.youtube.com/browse/MPREb_${a.albumId}`,
    }));
  }

  async getAlbumTracks(albumId: string, limit = 30): Promise<Track[]> {
    // albumId is the opaque id returned verbatim by searchAlbums; reject
    // anything else to avoid path/SSRF manipulation of the API call.
    if (!/^[A-Za-z0-9_-]+$/.test(albumId)) throw new Error(`invalid albumId: ${albumId}`);
    const api = await this.ensureApi();
    const album = await withTimeout(api.getAlbum(albumId), SEARCH_TIMEOUT_MS, null as any);
    const songs = (album?.songs ?? []) as any[];
    return songs.slice(0, limit).map(toTrack);
  }
}
