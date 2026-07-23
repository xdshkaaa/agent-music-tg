import type { Album, ArtistCard, MusicProvider, ProviderCapabilities, Track } from "./types";
import { withTrackCache, withQueryCache } from "./search-cache";

const API_BASE = "https://api-v2.soundcloud.com";

function normalizeName(s: string): string {
  return s.normalize("NFKD").toLowerCase().trim();
}

function pickByArtist(items: any[], artist: string): any | undefined {
  const want = normalizeName(artist);
  return items.find((item) => {
    const got = normalizeName(item?.user?.username ?? "");
    return got === want || got.includes(want) || want.includes(got);
  });
}

function toTrack(item: any): Track {
  return {
    uri: `sc:${item.id}`,
    title: item.title,
    artist: item.user?.username ?? "",
    durationMs: item.duration,
    artwork: item.artwork_url ?? undefined,
    deepLink: item.permalink_url,
  };
}

/** Scrapes a SoundCloud api-v2 client_id from the public site — ported from spotify-harness-tui. */
async function scrapeClientId(): Promise<string | null> {
  const page = await fetch("https://soundcloud.com/");
  if (!page.ok) return null;
  const html = await page.text();
  const scriptUrls = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)]
    .map((m) => m[1]!)
    .filter((u) => u.includes("sndcdn.com"));
  for (const url of scriptUrls.reverse()) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const js = await res.text();
      const match = js.match(/client_id\s*[:=]\s*"([a-zA-Z0-9]{16,})"/);
      if (match) return match[1]!;
    } catch {
      // try the next bundle
    }
  }
  return null;
}

/**
 * Resolve-only SoundCloud backend (per design.md): no local playback device
 * exists on a VPS, so this only searches and returns deep links — no
 * createPlaylist/addTracksToPlaylist.
 */
export class SoundCloudBackend implements MusicProvider {
  readonly name = "soundcloud" as const;
  readonly capabilities: ProviderCapabilities = {
    remotePlaylists: false,
    remotePlayback: false,
  };

  private clientId: string | null;

  constructor(clientId?: string) {
    this.clientId = clientId ?? null;
  }

  private async ensureClientId(): Promise<string> {
    if (this.clientId) return this.clientId;
    const scraped = await scrapeClientId();
    if (!scraped) throw new Error("could not auto-detect a SoundCloud client_id");
    this.clientId = scraped;
    return scraped;
  }

  private async request(path: string): Promise<any> {
    const clientId = await this.ensureClientId();
    const sep = path.includes("?") ? "&" : "?";
    const url = () => `${API_BASE}${path}${sep}client_id=${clientId}`;
    let res = await fetch(url());
    if (res.status === 401 || res.status === 403) {
      this.clientId = null;
      const fresh = await this.ensureClientId();
      res = await fetch(`${API_BASE}${path}${sep}client_id=${fresh}`);
    }
    if (!res.ok) {
      throw new Error(`soundcloud API ${path.split("?")[0]} failed: ${res.status}`);
    }
    return res.json();
  }

  async searchTrack(artist: string, title: string): Promise<Track | null> {
    return withTrackCache("soundcloud", artist, title, async () => {
      const q = encodeURIComponent(`${artist} ${title}`);
      const data = await this.request(`/search/tracks?q=${q}&limit=10`);
      const items = (data.collection ?? []) as any[];
      const item = pickByArtist(items, artist) ?? items[0];
      return item ? toTrack(item) : null;
    });
  }

  async searchTracks(query: string, rawLimit = 10): Promise<Track[]> {
    const limit = clampLimit(rawLimit, 25);
    return withQueryCache("soundcloud", "tracks", query, limit, async () => {
      const q = encodeURIComponent(query);
      const data = await this.request(`/search/tracks?q=${q}&limit=${limit}`);
      return ((data.collection ?? []) as any[]).slice(0, limit).map(toTrack);
    });
  }

  async searchArtist(name: string): Promise<{ id: string; name: string } | null> {
    return withQueryCache("soundcloud", "artist", name, 1, async () => {
      const q = encodeURIComponent(name);
      const data = await this.request(`/search/users?q=${q}&limit=1`);
      const item = (data.collection ?? [])[0];
      return item ? { id: String(item.id), name: item.username } : null;
    });
  }

  async searchArtists(name: string, rawLimit = 5): Promise<ArtistCard[]> {
    const limit = clampLimit(rawLimit, 10);
    return withQueryCache("soundcloud", "artists", name, limit, async () => {
      const q = encodeURIComponent(name);
      const data = await this.request(`/search/users?q=${q}&limit=${limit}`);
      return ((data.collection ?? []) as any[]).slice(0, limit).map((item) => ({
        id: String(item.id),
        name: item.username,
        artwork: item.avatar_url ?? undefined,
      }));
    });
  }

  /** SoundCloud has no album/latest-releases concept surfaced here — omitted client-side. */
  async getArtistAlbums(): Promise<Album[]> {
    return [];
  }

  async getArtistTopTracks(artistId: string, rawLimit = 5): Promise<Track[]> {
    // artistId comes from the agent, which echoes it back verbatim from a
    // prior searchArtist result. Reject anything that isn't the opaque numeric
    // id SoundCloud returns, so a crafted value can't manipulate the request
    // path (path traversal / SSRF against an internal host).
    if (!/^\d+$/.test(artistId)) throw new Error(`invalid artistId: ${artistId}`);
    const limit = clampLimit(rawLimit, 20);
    const data = await this.request(`/users/${artistId}/toptracks?limit=${limit}`);
    return ((data.collection ?? []) as any[]).slice(0, limit).map(toTrack);
  }

  async searchAlbums(query: string, rawLimit = 10): Promise<Album[]> {
    const limit = clampLimit(rawLimit, 25);
    return withQueryCache("soundcloud", "albums", query, limit, async () => {
      const q = encodeURIComponent(query);
      const data = await this.request(`/search/albums?q=${q}&limit=${limit}`);
      return ((data.collection ?? []) as any[]).slice(0, limit).map((item) => ({
        uri: `sc:${item.id}`,
        title: item.title,
        artist: item.user?.username ?? "",
        artwork: item.artwork_url ?? undefined,
        deepLink: item.permalink_url,
      }));
    });
  }

  async getAlbumTracks(albumId: string, rawLimit = 30): Promise<Track[]> {
    // albumId comes from searchAlbums, echoed verbatim. Reject anything
    // that isn't the opaque numeric id SoundCloud returns.
    if (!/^\d+$/.test(albumId)) throw new Error(`invalid albumId: ${albumId}`);
    const limit = clampLimit(rawLimit, 50);
    const data = await this.request(`/playlists/${albumId}/tracks?limit=${limit}`);
    return ((data.collection ?? []) as any[]).slice(0, limit).map(toTrack);
  }
}

/** Clamps a caller-supplied limit into a safe positive range. */
function clampLimit(raw: unknown, max: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return Math.min(10, max);
  return Math.min(Math.floor(n), max);
}
