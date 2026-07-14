import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { streamUrl } from "./api";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

export interface PlayerTrackInfo {
  uri: string;
  title: string;
  artist: string;
  artwork?: string;
}

interface PlayerState {
  track: PlayerTrackInfo | null;
  status: PlayerStatus;
  /** 0..1; NaN-safe (0 until duration is known). */
  progress: number;
  currentTime: number;
  duration: number;
  /** 0..1 */
  volume: number;
  muted: boolean;
  queue: PlayerTrackInfo[];
  queueIndex: number;
}

interface PlayerApi extends PlayerState {
  toggle(track: PlayerTrackInfo): void;
  seek(fraction: number): void;
  setVolume(v: number): void;
  toggleMute(): void;
  nextTrack(): void;
  previousTrack(): void;
  setQueue(tracks: PlayerTrackInfo[], startIndex?: number): void;
}

const VOLUME_KEY = "player:volume";
const DEFAULT_VOLUME = 0.7;

const FALLBACK_ARTWORK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">' +
  '<rect width="512" height="512" fill="#1a1a2e"/>' +
  '<text x="256" y="236" text-anchor="middle" font-family="sans-serif" font-size="32" font-weight="700" fill="#fff">Плейлист</text>' +
  '<text x="256" y="280" text-anchor="middle" font-family="sans-serif" font-size="32" font-weight="700" fill="#fff">Агент</text>' +
  "</svg>";
const FALLBACK_ARTWORK = `data:image/svg+xml,${encodeURIComponent(FALLBACK_ARTWORK_SVG)}`;

const PlayerContext = createContext<PlayerApi | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevVolumeRef = useRef(DEFAULT_VOLUME);
  const apiRef = useRef<PlayerApi>(null!);
  const [state, setState] = useState<PlayerState>({
    track: null,
    status: "idle",
    progress: 0,
    currentTime: 0,
    duration: 0,
    volume: DEFAULT_VOLUME,
    muted: false,
    queue: [],
    queueIndex: -1,
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VOLUME_KEY);
      if (saved !== null) {
        const v = parseFloat(saved);
        if (Number.isFinite(v) && v >= 0 && v <= 1) {
          setState((s) => ({ ...s, volume: v }));
          if (audioRef.current) audioRef.current.volume = v;
        }
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  function ensureAudio(): HTMLAudioElement {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio();
    audio.preload = "none";
    audio.volume = state.volume;
    audio.addEventListener("playing", () => setState((s) => ({ ...s, status: "playing" })));
    audio.addEventListener("pause", () => setState((s) => (s.status === "error" ? s : { ...s, status: "paused" })));
    audio.addEventListener("ended", () => setState((s) => ({ ...s, status: "paused", progress: 0, currentTime: 0 })));
    audio.addEventListener("error", () => setState((s) => ({ ...s, status: "error" })));
    audio.addEventListener("timeupdate", () => {
      const fraction = audio.duration > 0 ? audio.currentTime / audio.duration : 0;
      setState((s) => ({ ...s, progress: fraction, currentTime: audio.currentTime, duration: audio.duration }));
    });
    audio.addEventListener("loadedmetadata", () => {
      setState((s) => ({ ...s, duration: audio.duration }));
    });
    audio.addEventListener("durationchange", () => {
      setState((s) => ({ ...s, duration: audio.duration }));
    });
    audioRef.current = audio;
    return audio;
  }

  function setVolume(v: number) {
    const audio = audioRef.current;
    if (audio) audio.volume = v;
    setState((s) => ({ ...s, volume: v, muted: false }));
    try {
      localStorage.setItem(VOLUME_KEY, String(v));
    } catch {
      /* localStorage unavailable */
    }
  }

  function toggleMute() {
    const audio = audioRef.current;
    setState((s) => {
      if (s.muted) {
        const restore = prevVolumeRef.current;
        if (audio) audio.volume = restore;
        return { ...s, muted: false, volume: restore };
      }
      prevVolumeRef.current = s.volume;
      if (audio) audio.volume = 0;
      return { ...s, muted: true, volume: 0 };
    });
  }

  const api = useMemo<PlayerApi>(() => {
    return {
      ...state,
      toggle(track) {
        const audio = ensureAudio();
        if (state.track?.uri === track.uri) {
          if (state.status === "playing") {
            audio.pause();
          } else {
            setState((s) => ({ ...s, status: "loading" }));
            void audio.play().catch(() => setState((s) => ({ ...s, status: "error" })));
          }
          return;
        }
        const idx = state.queue.findIndex((t) => t.uri === track.uri);
        if (idx >= 0) {
          setState((s) => ({ ...s, queueIndex: idx, track, status: "loading", progress: 0, currentTime: 0, duration: 0 }));
        } else {
          setState((s) => ({ ...s, queue: [track], queueIndex: 0, track, status: "loading", progress: 0, currentTime: 0, duration: 0 }));
        }
        audio.src = streamUrl(track.uri);
        void audio.play().catch(() => setState((s) => ({ ...s, status: "error" })));
      },
      seek(fraction) {
        const audio = audioRef.current;
        if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
        audio.currentTime = Math.min(Math.max(fraction, 0), 1) * audio.duration;
      },
      setVolume,
      toggleMute,
      nextTrack() {
        if (state.queue.length < 2) return;
        const nextIndex = state.queueIndex + 1;
        if (nextIndex >= state.queue.length) return;
        const track = state.queue[nextIndex];
        const audio = ensureAudio();
        audio.src = streamUrl(track.uri);
        setState((s) => ({ ...s, track, queueIndex: nextIndex, status: "loading", progress: 0, currentTime: 0, duration: 0 }));
        void audio.play().catch(() => setState((s) => ({ ...s, status: "error" })));
      },
      previousTrack() {
        if (state.queue.length < 2) return;
        const prevIndex = state.queueIndex - 1;
        if (prevIndex < 0) return;
        const track = state.queue[prevIndex];
        const audio = ensureAudio();
        audio.src = streamUrl(track.uri);
        setState((s) => ({ ...s, track, queueIndex: prevIndex, status: "loading", progress: 0, currentTime: 0, duration: 0 }));
        void audio.play().catch(() => setState((s) => ({ ...s, status: "error" })));
      },
      setQueue(tracks) {
        setState((s) => ({ ...s, queue: tracks, queueIndex: 0 }));
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  apiRef.current = api;

  const artworkObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;

    const statusMap: Record<PlayerStatus, MediaSessionPlaybackState> = {
      idle: "none",
      loading: "none",
      playing: "playing",
      paused: "paused",
      error: "paused",
    };
    ms.playbackState = statusMap[state.status] ?? "none";

    if (!state.track) {
      if (artworkObjectUrlRef.current) {
        URL.revokeObjectURL(artworkObjectUrlRef.current);
        artworkObjectUrlRef.current = null;
      }
      ms.metadata = null;
      return;
    }

    const track = state.track;

    function setMetadata(artworkSrc: string, artworkType: string) {
      ms.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: "Плейлист Агент",
        artwork: [{ src: artworkSrc, sizes: "512x512", type: artworkType }],
      });
    }

    setMetadata(FALLBACK_ARTWORK, "image/svg+xml");

    if (track.artwork) {
      fetch(track.artwork, { mode: "cors" })
        .then((res) => {
          if (!res.ok) throw new Error("fetch failed");
          return res.blob();
        })
        .then((blob) => {
          if (artworkObjectUrlRef.current) {
            URL.revokeObjectURL(artworkObjectUrlRef.current);
          }
          const url = URL.createObjectURL(blob);
          artworkObjectUrlRef.current = url;
          setMetadata(url, blob.type || "image/jpeg");
        })
        .catch(() => {
          /* keep FALLBACK_ARTWORK */
        });
    }

    ms.setActionHandler("play", () => {
      if (apiRef.current.track && apiRef.current.status !== "playing") {
        apiRef.current.toggle(apiRef.current.track);
      }
    });
    ms.setActionHandler("pause", () => {
      if (apiRef.current.track && apiRef.current.status === "playing") {
        apiRef.current.toggle(apiRef.current.track);
      }
    });
    ms.setActionHandler("nexttrack", () => apiRef.current.nextTrack());
    ms.setActionHandler("previoustrack", () => apiRef.current.previousTrack());

    return () => {
      if (artworkObjectUrlRef.current) {
        URL.revokeObjectURL(artworkObjectUrlRef.current);
        artworkObjectUrlRef.current = null;
      }
      ms.setActionHandler("play", null);
      ms.setActionHandler("pause", null);
      ms.setActionHandler("nexttrack", null);
      ms.setActionHandler("previoustrack", null);
    };
  }, [state.track?.uri, state.status, state.track]);

  return <PlayerContext.Provider value={api}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerApi {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside PlayerProvider");
  return ctx;
}
