import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  CheckCircle,
  CircleNotch,
  DownloadSimple,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import { GlassPanel } from "../components/GlassPanel";
import { ReasoningTranscript } from "../components/ReasoningTranscript";
import { TrackPlayButton } from "../components/PlayerBar";
import { api, type Track } from "../lib/api";
import type { AgentEvent } from "../lib/reasoning";
import { useTextScramble } from "../lib/useTextScramble";

const MAX_INPUT_HEIGHT = 132;

type DownloadState = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };
type Mode = "ai" | "search";

type HeroPhrase = { before: string; accent: string; after: string };

const HERO_PHRASES: HeroPhrase[] = [
  { before: "Что ", accent: "слушаем", after: "?" },
  { before: "Какой ", accent: "вайб", after: "?" },
  { before: "Чего хочет ", accent: "душа", after: "?" },
  { before: "Врубаем ", accent: "музыку", after: "?" },
  { before: "Какое ", accent: "настроение", after: "?" },
];

export function PromptScreen({
  onSubmit,
  busy,
  events,
  isAdmin,
}: {
  onSubmit: (prompt: string) => void;
  busy: boolean;
  events: AgentEvent[];
  isAdmin?: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<Mode>("ai");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "error">("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [trackDownloads, setTrackDownloads] = useState<Record<string, DownloadState>>({});
  const requestId = useRef(0);

  const canSubmit = mode === "ai" && !busy && prompt.trim().length > 0;

  const [heroIndex, setHeroIndex] = useState(0);
  const [heroTrigger, setHeroTrigger] = useState(0);
  const heroPhrase = HERO_PHRASES[heroIndex];
  const heroFull = `${heroPhrase.before}${heroPhrase.accent}${heroPhrase.after}`;
  const { displayText: heroDisplay, isComplete: heroComplete } = useTextScramble(heroFull, heroTrigger, 500);

  useEffect(() => {
    const t = setTimeout(() => setHeroTrigger(1), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleHeroClick() {
    if (!heroComplete) return;
    let next = heroIndex;
    if (HERO_PHRASES.length > 1) {
      while (next === heroIndex) next = Math.floor(Math.random() * HERO_PHRASES.length);
    }
    setHeroIndex(next);
    setHeroTrigger((n) => n + 1);
  }

  useEffect(() => {
    if (mode !== "search") return;
    const q = prompt.trim();
    if (q.length === 0) {
      setTracks([]);
      setSearchStatus("idle");
      setSearchError(null);
      return;
    }
    const id = ++requestId.current;
    setSearchStatus("loading");
    setSearchError(null);
    const timer = setTimeout(() => {
      api
        .search(q)
        .then((res) => {
          if (requestId.current !== id) return;
          setTracks(res.tracks);
          setSearchStatus("idle");
        })
        .catch((e) => {
          if (requestId.current !== id) return;
          setSearchError(e instanceof Error ? e.message : String(e));
          setSearchStatus("error");
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [mode, prompt]);

  function autoGrow() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }

  function submit() {
    if (!canSubmit) return;
    onSubmit(prompt.trim());
  }

  function toggleMode() {
    setMode((m) => (m === "ai" ? "search" : "ai"));
  }

  async function handleTrackDownload(e: React.MouseEvent, track: Track) {
    e.stopPropagation();
    if (trackDownloads[track.uri]?.kind === "sending") return;
    setTrackDownloads((m) => ({ ...m, [track.uri]: { kind: "sending" } }));
    try {
      await api.download(`${track.title} — ${track.artist}`, [track]);
      setTrackDownloads((m) => ({ ...m, [track.uri]: { kind: "sent" } }));
      window.dispatchEvent(new CustomEvent("download-created"));
    } catch (err) {
      setTrackDownloads((m) => ({
        ...m,
        [track.uri]: { kind: "error", message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }

  return (
    <GlassPanel className="reveal prompt-card">
      <div className="prompt-hero">
        <h1 onClick={handleHeroClick} role="button" tabIndex={0}>
          {heroDisplay.slice(0, heroPhrase.before.length)}
          <span className="prompt-hero-accent">
            {heroDisplay.slice(heroPhrase.before.length, heroPhrase.before.length + heroPhrase.accent.length)}
          </span>
          {heroDisplay.slice(heroPhrase.before.length + heroPhrase.accent.length)}
        </h1>
      </div>

      <div className="prompt-pill">
        <textarea
          ref={inputRef}
          className="prompt-pill-input"
          rows={1}
          placeholder={mode === "ai" ? "Опишите запрос…" : "Трек или артист"}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            autoGrow();
          }}
          onKeyDown={(e) => {
            if (mode === "ai" && e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={busy}
        />
        <button
          type="button"
          className={`prompt-mode-toggle${mode === "search" ? " inactive" : ""}`}
          aria-label={mode === "ai" ? "Режим: AI" : "Режим: поиск"}
          aria-pressed={mode === "ai"}
          onClick={toggleMode}
        >
          <Sparkle size={18} weight={mode === "ai" ? "fill" : "regular"} />
          {mode === "search" && <span className="icon-strike" />}
        </button>
        {mode === "ai" && (
          <button
            type="button"
            className="prompt-submit"
            aria-label="Собрать плейлист"
            disabled={!canSubmit}
            onClick={submit}
          >
            {busy ? <CircleNotch size={20} weight="bold" className="spin" /> : <ArrowUp size={20} weight="bold" />}
          </button>
        )}
      </div>

      {mode === "ai" && events.length > 0 && (
        <ReasoningTranscript events={events} collapsed={!busy} friendly={!isAdmin} />
      )}

      {mode === "search" && (
        <>
          {searchStatus === "loading" && (
            <p className="text-muted mt-16" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CircleNotch size={16} className="spin" /> Ищу…
            </p>
          )}

          {searchStatus === "error" && (
            <div className="error-row mt-16" style={{ fontSize: 13 }}>
              <span className="error-row-icon">
                <WarningCircle size={16} weight="bold" />
              </span>
              <p role="alert" className="error-row-message">
                {searchError}
              </p>
            </div>
          )}

          {searchStatus === "idle" && prompt.trim().length > 0 && tracks.length === 0 && (
            <p className="text-muted mt-16">Ничего не найдено</p>
          )}

          {tracks.length > 0 && (
            <div className="stack mt-16 reveal-stagger">
              {tracks.map((track, i) => (
                <div className="track-row" key={track.uri} style={{ ["--i" as string]: i }}>
                  {track.artwork ? (
                    <img className="track-artwork" src={track.artwork} alt="" />
                  ) : (
                    <div className="track-artwork" />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {track.title}
                    </p>
                    <p className="text-muted" style={{ fontSize: 13 }}>
                      {track.artist}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="icon-btn track-download-btn"
                    aria-label={
                      trackDownloads[track.uri]?.kind === "sending"
                        ? "Отправляю…"
                        : trackDownloads[track.uri]?.kind === "sent"
                          ? "Отправлено в чат"
                          : "Сохранить трек"
                    }
                    title={
                      trackDownloads[track.uri]?.kind === "sending"
                        ? "Отправляю…"
                        : trackDownloads[track.uri]?.kind === "sent"
                          ? "Отправлено в чат"
                          : "Сохранить трек"
                    }
                    disabled={trackDownloads[track.uri]?.kind === "sending"}
                    onClick={(e) => void handleTrackDownload(e, track)}
                  >
                    {trackDownloads[track.uri]?.kind === "sending" ? (
                      <CircleNotch size={18} className="spin" />
                    ) : trackDownloads[track.uri]?.kind === "sent" ? (
                      <CheckCircle size={18} weight="fill" />
                    ) : (
                      <DownloadSimple size={18} />
                    )}
                  </button>
                  <TrackPlayButton
                    track={{ uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork }}
                    queue={tracks.map((t) => ({ uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork }))}
                    stopPropagation
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </GlassPanel>
  );
}
