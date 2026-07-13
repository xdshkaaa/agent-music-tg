import type { MusicProvider, ProviderCapabilities, Track } from "../music/types";

const API_BASE = "https://api.spotify.com/v1";

function normalizeName(s: string): string {
  return s.normalize("NFKD").toLowerCase().trim();
}

function pickByArtist(items: any[], artist: string): any | undefined {
  const want = normalizeName(artist);
  return items.find((item) =>
    (item.artists ?? []).some((a: any) => {
      const got = normalizeName(a?.name ?? "");
      return got === want || got.includes(want) || want.includes(got);
    }),
  );
}

export interface SpotifyPlaylist {
  id: string;
  uri: string;
  url: string;
  name: string;
}

export interface SpotifyDevice {
  id: string;
  name: string;
  isActive: boolean;
}

function toTrack(item: any, fallbackArtist = ""): Track {
  return {
    uri: item.uri,
    title: item.name,
    artist: item.artists?.[0]?.name ?? fallbackArtist,
    album: item.album?.name,
    durationMs: item.duration_ms,
    artwork: item.album?.images?.[0]?.url,
  };
}

/**
 * Ported from spotify-harness-tui/src/spotify/client.ts. One instance per
 * request, constructed with an already-refreshed access token for the
 * calling chat (see spotify/tokens.ts) — no per-instance token storage here.
 */
export class SpotifyClient implements MusicProvider {
  readonly name = "spotify" as const;
  readonly capabilities: ProviderCapabilities = {
    remotePlaylists: true,
    remotePlayback: true,
  };

  constructor(private accessToken: string) {}

  private rateLimitedUntil = 0;

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const MAX_RETRIES = 5;
    const MAX_429_WAIT_MS = 30_000;
    let attempt = 0;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (;;) {
      const pause = this.rateLimitedUntil - Date.now();
      if (pause > 0) await sleep(pause);
      const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${this.accessToken}`,
          "content-type": "application/json",
          ...init?.headers,
        },
      });
      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfterHeader = Number(res.headers.get("retry-after"));
        const backoff = Math.min(1000 * 2 ** attempt, 16_000);
        const waitMs =
          Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
            ? Math.max(retryAfterHeader * 1000, backoff)
            : backoff;
        if (waitMs > MAX_429_WAIT_MS) {
          throw new Error(
            `spotify API rate limited (429): asked to wait ${Math.ceil(waitMs / 1000)}s — try again later`,
          );
        }
        this.rateLimitedUntil = Math.max(this.rateLimitedUntil, Date.now() + waitMs);
        attempt++;
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        const hint =
          res.status === 403
            ? " — 403: app likely in Development Mode; add this Spotify account under Developer Dashboard → app → User Management"
            : "";
        throw new Error(`spotify API ${path.split("?")[0]} failed: ${res.status} ${body}${hint}`);
      }
      return res;
    }
  }

  async searchTrack(artist: string, title: string): Promise<Track | null> {
    const strict = await this.searchTrackQuery(`track:${title} artist:${artist}`);
    let item = pickByArtist(strict, artist);
    if (!item) {
      const loose = await this.searchTrackQuery(`${artist} ${title}`);
      item = pickByArtist(loose, artist) ?? loose[0];
    }
    if (!item) {
      const byTitle = await this.searchTrackQuery(`track:${title}`);
      item = byTitle[0];
    }
    if (!item) return null;
    return toTrack(item, artist);
  }

  private async searchTrackQuery(query: string): Promise<any[]> {
    const res = await this.request(`/search?q=${encodeURIComponent(query)}&type=track&limit=5`);
    const data = (await res.json()) as any;
    return data.tracks?.items ?? [];
  }

  async searchArtist(name: string): Promise<{ id: string; name: string } | null> {
    const strict = encodeURIComponent(`artist:${name}`);
    const res = await this.request(`/search?q=${strict}&type=artist&limit=1`);
    const data = (await res.json()) as any;
    let item = data.artists?.items?.[0];
    if (!item) {
      const loose = encodeURIComponent(name);
      const looseRes = await this.request(`/search?q=${loose}&type=artist&limit=1`);
      const looseData = (await looseRes.json()) as any;
      item = looseData.artists?.items?.[0];
    }
    if (!item) return null;
    return { id: item.id, name: item.name };
  }

  async getArtistTopTracks(artistId: string, limit = 5): Promise<Track[]> {
    const res = await this.request(`/artists/${artistId}/top-tracks?market=from_token`);
    const data = (await res.json()) as any;
    return ((data.tracks ?? []) as any[]).slice(0, limit).map((item) => toTrack(item));
  }

  async createPlaylist(name: string, description?: string): Promise<SpotifyPlaylist> {
    const res = await this.request(`/me/playlists`, {
      method: "POST",
      body: JSON.stringify({ name, description, public: false }),
    });
    const data = (await res.json()) as any;
    return { id: data.id, uri: data.uri, url: data.external_urls?.spotify ?? "", name: data.name };
  }

  async addTracksToPlaylist(playlistId: string, trackUris: string[]): Promise<void> {
    for (let i = 0; i < trackUris.length; i += 100) {
      const batch = trackUris.slice(i, i + 100);
      await this.request(`/playlists/${playlistId}/items`, {
        method: "POST",
        body: JSON.stringify({ uris: batch }),
      }).catch(async (e) => {
        if (e instanceof Error && /\b40[34]\b/.test(e.message)) {
          return this.request(`/playlists/${playlistId}/tracks`, {
            method: "POST",
            body: JSON.stringify({ uris: batch }),
          });
        }
        throw e;
      });
    }
  }

  async getDevices(): Promise<SpotifyDevice[]> {
    const res = await this.request("/me/player/devices");
    const data = (await res.json()) as any;
    return (data.devices ?? []).map((d: any) => ({
      id: d.id,
      name: d.name,
      isActive: d.is_active,
    }));
  }

  private async resolveTargetDevice(deviceId?: string): Promise<string> {
    const devices = await this.getDevices();
    if (devices.length === 0) {
      throw new Error("No Spotify devices found. Open the Spotify app on any device first.");
    }
    const activeDevice = devices.find((d) => d.isActive);
    const target = deviceId ?? activeDevice?.id ?? devices[0]?.id;
    if (!target) throw new Error("No Spotify device available to target.");
    return target;
  }

  async play(uri: string, deviceId?: string): Promise<void> {
    const targetDeviceId = await this.resolveTargetDevice(deviceId);
    const isPlaylistOrAlbum = uri.includes(":playlist:") || uri.includes(":album:");
    await this.request(`/me/player/play?device_id=${targetDeviceId}`, {
      method: "PUT",
      body: JSON.stringify(isPlaylistOrAlbum ? { context_uri: uri } : { uris: [uri] }),
    });
  }

  async pause(): Promise<void> {
    await this.request("/me/player/pause", { method: "PUT" });
  }

  async resume(): Promise<void> {
    await this.request("/me/player/play", { method: "PUT" });
  }

  async next(): Promise<void> {
    await this.request("/me/player/next", { method: "POST" });
  }

  async previous(): Promise<void> {
    await this.request("/me/player/previous", { method: "POST" });
  }

  async setVolume(percent: number, deviceId?: string): Promise<void> {
    const pct = Math.max(0, Math.min(100, Math.round(percent)));
    const targetDeviceId = await this.resolveTargetDevice(deviceId);
    await this.request(`/me/player/volume?volume_percent=${pct}&device_id=${targetDeviceId}`, {
      method: "PUT",
    });
  }

  async getCurrentlyPlaying(): Promise<{
    uri: string | null;
    isPlaying: boolean;
    volume: number | null;
    trackTitle?: string;
    trackArtist?: string;
  } | null> {
    const res = await this.request("/me/player").catch(() => null);
    if (!res || res.status === 204) return null;
    const data = (await res.json()) as any;
    return {
      uri: data?.item?.uri ?? data?.context?.uri ?? null,
      isPlaying: data?.is_playing ?? false,
      volume: typeof data?.device?.volume_percent === "number" ? data.device.volume_percent : null,
      trackTitle: data?.item?.name ?? undefined,
      trackArtist: data?.item?.artists?.[0]?.name ?? undefined,
    };
  }
}
