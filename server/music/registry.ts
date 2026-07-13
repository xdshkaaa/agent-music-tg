import type { MusicBackend, MusicProvider } from "./types";
import { SpotifyClient } from "../spotify/client";
import { SoundCloudBackend } from "./soundcloud-backend";
import { YouTubeMusicBackend } from "./youtube-backend";

export const AVAILABLE_BACKENDS: MusicBackend[] = ["spotify", "soundcloud", "youtube-music"];

export function isMusicBackend(value: string): value is MusicBackend {
  return (AVAILABLE_BACKENDS as string[]).includes(value);
}

// SoundCloud/YouTube Music have no per-chat credentials, so one instance
// (with its own scraped client_id / lazily-initialized api) is reused.
const soundcloud = new SoundCloudBackend();
const youtubeMusic = new YouTubeMusicBackend();

export class SpotifyLinkRequiredError extends Error {
  constructor() {
    super("the active backend is Spotify but this chat has not linked a Spotify account");
  }
}

export function createMusicProvider(backend: MusicBackend, opts: { spotifyAccessToken?: string }): MusicProvider {
  switch (backend) {
    case "spotify":
      if (!opts.spotifyAccessToken) throw new SpotifyLinkRequiredError();
      return new SpotifyClient(opts.spotifyAccessToken);
    case "soundcloud":
      return soundcloud;
    case "youtube-music":
      return youtubeMusic;
  }
}
