import type { MusicBackend, MusicProvider } from "./types";
import { SoundCloudBackend } from "./soundcloud-backend";
import { YouTubeMusicBackend } from "./youtube-backend";

export const AVAILABLE_BACKENDS: MusicBackend[] = ["soundcloud", "youtube-music"];

export function isMusicBackend(value: string): value is MusicBackend {
  return (AVAILABLE_BACKENDS as string[]).includes(value);
}

// SoundCloud/YouTube Music have no per-chat credentials, so one instance
// (with its own scraped client_id / lazily-initialized api) is reused.
const soundcloud = new SoundCloudBackend();
const youtubeMusic = new YouTubeMusicBackend();

export function createMusicProvider(backend: MusicBackend): MusicProvider {
  switch (backend) {
    case "soundcloud":
      return soundcloud;
    case "youtube-music":
      return youtubeMusic;
  }
}
