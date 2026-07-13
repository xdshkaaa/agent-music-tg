import { getInitData } from "./telegram";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      "X-Telegram-Init-Data": getInitData(),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface MeResponse {
  chatId: number;
  isAdmin: boolean;
}

export interface Track {
  uri: string;
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  artwork?: string;
  deepLink?: string;
}

export interface FinalizedPlaylist {
  name: string;
  tracks: Track[];
  remotePlaylistUrl?: string;
}

export type GenerateOutcome =
  | { status: "ok"; playlist: FinalizedPlaylist }
  | { status: "clarify"; question: string; options: string[] }
  | { status: "error"; message: string };

export interface AdminSettings {
  activeProvider: string;
  activeBackend: string;
  availableProviders: string[];
  availableBackends: string[];
}

export const api = {
  me: () => request<MeResponse>("/api/me"),
  spotifyStatus: () => request<{ linked: boolean }>("/api/spotify/status"),
  spotifyLink: () => request<{ url: string }>("/api/spotify/link", { method: "POST" }),
  generate: (prompt: string) =>
    request<GenerateOutcome>("/api/generate", { method: "POST", body: JSON.stringify({ prompt }) }),
  generateResume: (answer: string) =>
    request<GenerateOutcome>("/api/generate/resume", { method: "POST", body: JSON.stringify({ answer }) }),
  adminSettings: () => request<AdminSettings>("/api/admin/settings"),
  setActiveProvider: (id: string) =>
    request<{ activeProvider: string }>("/api/admin/settings/provider", { method: "POST", body: JSON.stringify({ id }) }),
  setActiveBackend: (id: string) =>
    request<{ activeBackend: string }>("/api/admin/settings/backend", { method: "POST", body: JSON.stringify({ id }) }),
  play: (uri?: string) => request<{ ok: true }>("/api/spotify/play", { method: "POST", body: JSON.stringify({ uri }) }),
  pause: () => request<{ ok: true }>("/api/spotify/pause", { method: "POST" }),
  next: () => request<{ ok: true }>("/api/spotify/next", { method: "POST" }),
  previous: () => request<{ ok: true }>("/api/spotify/previous", { method: "POST" }),
  setVolume: (percent: number) =>
    request<{ ok: true }>("/api/spotify/volume", { method: "POST", body: JSON.stringify({ percent }) }),
};
