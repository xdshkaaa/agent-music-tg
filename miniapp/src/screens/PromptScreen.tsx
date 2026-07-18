import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  CheckCircle,
  CircleNotch,
  DownloadSimple,
  HeartStraight,
  ListPlus,
  MagnifyingGlass,
  CaretRightIcon,
  Sparkle,
  User,
  WarningCircle,
} from "@phosphor-icons/react";
import { GlassPanel } from "../components/GlassPanel";
import { ReasoningTranscript } from "../components/ReasoningTranscript";
import { TrackOverflowMenu } from "../components/TrackOverflowMenu";
import { requestAddToPlaylist } from "../components/AddToPlaylistButton";
import { api, type Album, type ArtistCard, type Track } from "../lib/api";
import { usePlayer } from "../lib/player";
import type { AgentEvent } from "../lib/reasoning";
import { useTextScramble } from "../lib/useTextScramble";

const MAX_INPUT_HEIGHT = 96;
const RECENT_KEY = "miniapp-recent-searches";
const RECENT_MAX = 8;

type DownloadState = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };
type Mode = "ai" | "search";

type AlbumState = {
  tracks: Track[];
  status: "idle" | "loading" | "error";
  error: string | null;
};

type HeroPhrase = { before: string; accent: string; after: string };

const HERO_PHRASES: HeroPhrase[] = [
  { before: "Что ", accent: "слушаем", after: "?" },
  { before: "Какой ", accent: "вайб", after: "?" },
  { before: "Чего хочет ", accent: "душа", after: "?" },
  { before: "Врубаем ", accent: "музыку", after: "?" },
  { before: "Какое ", accent: "настроение", after: "?" },
];

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function pushRecent(query: string): string[] {
  const q = query.trim();
  if (!q) return loadRecent();
  const next = [q, ...loadRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
  return next;
}

export interface ArtistHit {
  name: string;
  artwork: string | null;
}

/** Rank unique artist names from tracks + albums, preferring exact / prefix matches. */
function deriveArtists(query: string, tracks: Track[], albums: Album[], limit = 6): ArtistHit[] {
  const q = query.trim().toLowerCase();
  const counts = new Map<string, { name: string; score: number; artwork: string | null }>();

  function add(name: string, base: number, artwork: string | undefined) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    const lower = key;
    let bonus = base;
    if (lower === q) bonus += 100;
    else if (lower.startsWith(q)) bonus += 40;
    else if (lower.includes(q)) bonus += 15;
    const prev = counts.get(key);
    if (!prev) {
      counts.set(key, { name: trimmed, score: bonus, artwork: artwork ?? null });
    } else {
      counts.set(key, {
        name: prev.name,
        score: bonus > prev.score ? bonus : prev.score + 1,
        artwork: prev.artwork ?? artwork ?? null,
      });
    }
  }

  for (const t of tracks) add(t.artist, 10, t.artwork);
  for (const a of albums) add(a.artist, 12, a.artwork);

  return [...counts.values()]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ru"))
    .slice(0, limit)
    .map((x) => ({ name: x.name, artwork: x.artwork }));
}

export function PromptScreen({
  onSubmit,
  busy,
  events,
  isAdmin,
  onOpenArtist,
}: {
  onSubmit: (prompt: string) => void;
  busy: boolean;
  events: AgentEvent[];
  isAdmin?: boolean;
  onOpenArtist: (target: { id?: string; name?: string }) => void;
}) {
  const player = usePlayer();
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<Mode>(() =>
    new URLSearchParams(window.location.search).get("mode") === "search" ? "search" : "ai",
  );
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [serverArtists, setServerArtists] = useState<ArtistCard[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "error">("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, AlbumState>>({});
  const [trackDownloads, setTrackDownloads] = useState<Record<string, DownloadState>>({});
  const [savedTracks, setSavedTracks] = useState<Record<string, boolean>>({});
  const [savingTracks, setSavingTracks] = useState<Record<string, boolean>>({});
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const requestId = useRef(0);

  useEffect(() => {
    api
      .myMusic()
      .then(({ tracks }) => {
        setSavedTracks(Object.fromEntries(tracks.map((t) => [t.uri, true])));
      })
      .catch(() => {
        // leave saved-state empty; toggling still works, just without prior hydration
      });
  }, []);

  async function toggleMyMusic(track: Track) {
    const isSaved = !!savedTracks[track.uri];
    setSavingTracks((prev) => ({ ...prev, [track.uri]: true }));
    try {
      if (isSaved) {
        await api.removeMyMusic(track.uri);
        setSavedTracks((prev) => ({ ...prev, [track.uri]: false }));
      } else {
        await api.addMyMusic({ uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork });
        setSavedTracks((prev) => ({ ...prev, [track.uri]: true }));
      }
    } catch {
      // leave state unchanged on failure; user can retry
    } finally {
      setSavingTracks((prev) => ({ ...prev, [track.uri]: false }));
    }
  }

  const canSubmit = mode === "ai" && !busy && prompt.trim().length > 0;

  const [heroIndex, setHeroIndex] = useState(0);
  const [heroTrigger, setHeroTrigger] = useState(0);
  const heroPhrase = HERO_PHRASES[heroIndex];
  const heroFull = `${heroPhrase.before}${heroPhrase.accent}${heroPhrase.after}`;
  const { displayText: heroDisplay, isComplete: heroComplete } = useTextScramble(heroFull, heroTrigger, 500);

  // Prefer real artist cards from the backend (carry an id, so tapping opens
  // ArtistScreen directly); fall back to names derived from track/album hits
  // when the backend has none (still openable, resolved by name server-side).
  const artists: (ArtistHit & { id?: string })[] = useMemo(() => {
    if (mode !== "search" || !prompt.trim()) return [];
    if (serverArtists.length > 0) {
      return serverArtists.map((a) => ({ id: a.id, name: a.name, artwork: a.artwork ?? null }));
    }
    return deriveArtists(prompt, tracks, albums);
  }, [mode, prompt, tracks, albums, serverArtists]);

  const hasResults = tracks.length > 0 || albums.length > 0 || artists.length > 0;
  const queryActive = mode === "search" && prompt.trim().length > 0;

  useEffect(() => {
    const t = setTimeout(() => setHeroTrigger(1), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== "search") return;
    const el = inputRef.current;
    if (!el) return;
    // Autofocus search so the first action is typing, not mode-picking.
    const t = setTimeout(() => el.focus(), 40);
    return () => clearTimeout(t);
  }, [mode]);

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
      setAlbums([]);
      setSearchStatus("idle");
      setSearchError(null);
      return;
    }
    const id = ++requestId.current;
    setSearchStatus("loading");
    setSearchError(null);
    const timer = setTimeout(() => {
      Promise.allSettled([api.search(q, 20), api.searchAlbums(q, 12)])
        .then(([trackRes, albumRes]) => {
          if (requestId.current !== id) return;
          const nextTracks = trackRes.status === "fulfilled" ? trackRes.value.tracks : [];
          const nextAlbums = albumRes.status === "fulfilled" ? albumRes.value.albums : [];
          setTracks(nextTracks);
          setAlbums(nextAlbums);
          setServerArtists(trackRes.status === "fulfilled" ? (trackRes.value.artists ?? []) : []);
          if (trackRes.status === "rejected" && albumRes.status === "rejected") {
            const err = trackRes.reason;
            setSearchError(err instanceof Error ? err.message : String(err));
            setSearchStatus("error");
            return;
          }
          setSearchStatus("idle");
          setRecent(pushRecent(q));
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [mode, prompt]);

  async function toggleAlbum(album: Album) {
    if (expanded[album.uri]) {
      setExpanded((m) => {
        const next = { ...m };
        delete next[album.uri];
        return next;
      });
      return;
    }
    setExpanded((m) => ({ ...m, [album.uri]: { tracks: [], status: "loading", error: null } }));
    try {
      const { tracks } = await api.albumTracks(album.uri);
      setExpanded((m) => ({ ...m, [album.uri]: { tracks, status: "idle", error: null } }));
    } catch (e) {
      setExpanded((m) => ({
        ...m,
        [album.uri]: { tracks: [], status: "error", error: e instanceof Error ? e.message : String(e) },
      }));
    }
  }

  async function downloadAlbumTracks(album: Album, albumTracks: Track[]) {
    if (albumTracks.length === 0) return;
    const key = `album:${album.uri}`;
    if (trackDownloads[key]?.kind === "sending") return;
    setTrackDownloads((m) => ({ ...m, [key]: { kind: "sending" } }));
    try {
      await api.download(`${album.title} — ${album.artist}`, albumTracks);
      setTrackDownloads((m) => ({ ...m, [key]: { kind: "sent" } }));
      window.dispatchEvent(new CustomEvent("download-created"));
    } catch (err) {
      setTrackDownloads((m) => ({
        ...m,
        [key]: { kind: "error", message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }

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

  function pickRecent(q: string) {
    setPrompt(q);
    requestAnimationFrame(() => {
      autoGrow();
      inputRef.current?.focus();
    });
  }

  const MODES: { id: Mode; label: string; icon: typeof Sparkle }[] = [
    { id: "ai", label: "AI", icon: Sparkle },
    { id: "search", label: "Поиск", icon: MagnifyingGlass },
  ];

  async function handleTrackDownload(track: Track) {
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

      <div className="prompt-modes" role="group" aria-label="Режим">
        {MODES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              className={`prompt-mode-seg-btn${mode === m.id ? " active" : ""}`}
              aria-pressed={mode === m.id}
              onClick={() => setMode(m.id)}
            >
              <Icon size={15} weight={mode === m.id ? "fill" : "regular"} />
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      <div className={`prompt-pill${mode === "search" ? " prompt-pill--search" : ""}`}>
        {mode === "search" && (
          <span className="prompt-pill-icon" aria-hidden>
            <MagnifyingGlass size={18} weight="bold" />
          </span>
        )}
        <textarea
          ref={inputRef}
          className="prompt-pill-input"
          rows={1}
          placeholder={mode === "ai" ? "Опишите запрос…" : "Трек, исполнитель или альбом"}
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
        {mode === "ai" && (
          <button
            type="button"
            className="prompt-submit"
            aria-label="Собрать плейлист"
            disabled={!canSubmit}
            onClick={submit}
          >
            {busy ? <CircleNotch size={18} weight="bold" className="spin" /> : <ArrowUp size={18} weight="bold" />}
          </button>
        )}
      </div>

      {mode === "ai" && events.length > 0 && (
        <ReasoningTranscript events={events} collapsed={!busy} friendly={!isAdmin} />
      )}

      {mode === "search" && !queryActive && recent.length > 0 && (
        <div className="search-section">
          <h2 className="search-section-title">Недавние поиски</h2>
          <div className="search-recent">
            {recent.map((q) => (
              <button key={q} type="button" className="search-recent-chip" onClick={() => pickRecent(q)}>
                <MagnifyingGlass size={14} weight="bold" />
                <span>{q}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === "search" && queryActive && (
        <>
          {searchStatus === "loading" && !hasResults && (
            <p className="text-muted search-status">
              <CircleNotch size={16} className="spin" /> Ищу…
            </p>
          )}

          {searchStatus === "error" && (
            <div className="error-row search-status">
              <span className="error-row-icon">
                <WarningCircle size={16} weight="bold" />
              </span>
              <p role="alert" className="error-row-message">
                {searchError}
              </p>
            </div>
          )}

          {searchStatus === "idle" && !hasResults && (
            <div className="search-empty">
              <p className="search-empty-title">Ничего не найдено</p>
              <p className="text-muted search-empty-hint">Попробуйте:</p>
              <ul className="search-empty-list">
                <li>другое название</li>
                <li>имя исполнителя</li>
                <li>название альбома</li>
              </ul>
            </div>
          )}

          {artists.length > 0 && (
            <section className="search-section">
              <h2 className="search-section-title">Исполнители</h2>
              <div className="stack reveal-stagger">
                {artists.map(({ id, name, artwork }, i) => (
                  <button
                    key={id ?? name}
                    type="button"
                    className="track-row search-artist-row"
                    style={{ ["--i" as string]: i }}
                    onClick={() => onOpenArtist(id ? { id } : { name })}
                  >
                    <span className="search-artist-avatar" aria-hidden>
                      {artwork ? <img src={artwork} alt="" /> : <User size={18} weight="bold" />}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="search-row-title">{name}</p>
                      <p className="text-muted search-row-meta">Исполнитель</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {albums.length > 0 && (
            <section className="search-section">
              <h2 className="search-section-title">Альбомы</h2>
              <div className="stack reveal-stagger">
                {albums.map((album, i) => {
                  const open = expanded[album.uri];
                  const dlKey = `album:${album.uri}`;
                  const dl = trackDownloads[dlKey];
                  return (
                    <div className="album-block" key={album.uri} style={{ ["--i" as string]: i }}>
                      <div
                        className="track-row album-head"
                        role="button"
                        tabIndex={0}
                        onClick={() => void toggleAlbum(album)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            void toggleAlbum(album);
                          }
                        }}
                      >
                        {album.artwork ? (
                          <img className="track-artwork" src={album.artwork} alt="" />
                        ) : (
                          <div className="track-artwork" />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p className="search-row-title">{album.title}</p>
                          <p className="text-muted search-row-meta">{album.artist}</p>
                        </div>
                        <button
                          type="button"
                          className="icon-btn track-download-btn"
                          aria-label={
                            dl?.kind === "sending"
                              ? "Отправляю альбом…"
                              : dl?.kind === "sent"
                                ? "Отправлено в чат"
                                : "Сохранить альбом"
                          }
                          title={
                            dl?.kind === "sending"
                              ? "Отправляю альбом…"
                              : dl?.kind === "sent"
                                ? "Отправлено в чат"
                                : "Сохранить альбом"
                          }
                          disabled={dl?.kind === "sending"}
                          onClick={(e) => {
                            e.stopPropagation();
                            void downloadAlbumTracks(album, open?.tracks ?? []);
                          }}
                        >
                          {dl?.kind === "sending" ? (
                            <CircleNotch size={18} className="spin" />
                          ) : dl?.kind === "sent" ? (
                            <CheckCircle size={18} weight="fill" />
                          ) : (
                            <DownloadSimple size={18} />
                          )}
                        </button>
                        <span className={`album-chevron${open ? " open" : ""}`} aria-hidden>
                          <CaretRightIcon size={16} />
                        </span>
                      </div>
                      {open && (
                        <div className="album-tracks">
                          {open.status === "loading" && (
                            <p className="text-muted" style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px" }}>
                              <CircleNotch size={14} className="spin" /> Загружаю треки…
                            </p>
                          )}
                          {open.status === "error" && (
                            <p className="text-muted" style={{ padding: "4px 8px" }}>{open.error}</p>
                          )}
                          {open.status === "idle" && open.tracks.length === 0 && (
                            <p className="text-muted" style={{ padding: "4px 8px" }}>Пусто</p>
                          )}
                          {open.tracks.map((track) => (
                            <div
                              className="track-row track-sub"
                              key={track.uri}
                              role="button"
                              tabIndex={0}
                              onClick={() =>
                                player.toggle(
                                  { uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork },
                                  open.tracks.map((t) => ({ uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork })),
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key !== "Enter" && e.key !== " ") return;
                                e.preventDefault();
                                player.toggle(
                                  { uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork },
                                  open.tracks.map((t) => ({ uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork })),
                                );
                              }}
                            >
                              <div style={{ width: 44, flex: "0 0 auto" }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p className="search-row-title">{track.title}</p>
                                <p className="text-muted search-row-meta">{track.artist}</p>
                              </div>
                              <button
                                type="button"
                                className="icon-btn"
                                aria-label={savedTracks[track.uri] ? "Убрать из моей музыки" : "Добавить в мою музыку"}
                                title={savedTracks[track.uri] ? "Убрать из моей музыки" : "Добавить в мою музыку"}
                                disabled={!!savingTracks[track.uri]}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void toggleMyMusic(track);
                                }}
                              >
                                <HeartStraight
                                  size={18}
                                  weight={savedTracks[track.uri] ? "fill" : "bold"}
                                  style={savedTracks[track.uri] ? { color: "var(--accent)" } : undefined}
                                />
                              </button>
                              <TrackOverflowMenu
                                actions={[
                                  {
                                    key: "add-to-playlist",
                                    label: "Добавить в плейлист",
                                    icon: <ListPlus size={18} weight="bold" />,
                                    onClick: () => requestAddToPlaylist(track),
                                  },
                                ]}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {tracks.length > 0 && (
            <section className="search-section">
              <h2 className="search-section-title">Треки</h2>
              <div className="stack reveal-stagger">
                {tracks.map((track, i) => (
                  <div
                    className="track-row"
                    key={track.uri}
                    style={{ ["--i" as string]: i }}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      player.toggle(
                        { uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork },
                        tracks.map((t) => ({ uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork })),
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      player.toggle(
                        { uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork },
                        tracks.map((t) => ({ uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork })),
                      );
                    }}
                  >
                    {track.artwork ? (
                      <img className="track-artwork" src={track.artwork} alt="" />
                    ) : (
                      <div className="track-artwork" />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="search-row-title">{track.title}</p>
                      <p className="text-muted search-row-meta">{track.artist}</p>
                    </div>
                    {(trackDownloads[track.uri]?.kind === "sent" || savedTracks[track.uri]) && (
                      <CheckCircle size={16} weight="fill" style={{ color: "var(--accent)" }} />
                    )}
                    {trackDownloads[track.uri]?.kind === "sending" && (
                      <CircleNotch size={16} className="spin" style={{ color: "var(--text-muted)" }} />
                    )}
                    <TrackOverflowMenu
                      actions={[
                        {
                          key: "save",
                          label: savedTracks[track.uri] ? "Убрать из моей музыки" : "Добавить в мою музыку",
                          icon: <HeartStraight size={18} weight={savedTracks[track.uri] ? "fill" : "bold"} />,
                          disabled: !!savingTracks[track.uri],
                          onClick: () => void toggleMyMusic(track),
                        },
                        {
                          key: "download",
                          label: trackDownloads[track.uri]?.kind === "sent" ? "Отправлено в чат" : "Скачать",
                          icon:
                            trackDownloads[track.uri]?.kind === "sent" ? (
                              <CheckCircle size={18} weight="fill" />
                            ) : (
                              <DownloadSimple size={18} />
                            ),
                          disabled: trackDownloads[track.uri]?.kind === "sending",
                          onClick: () => void handleTrackDownload(track),
                        },
                        {
                          key: "add-to-playlist",
                          label: "Добавить в плейлист",
                          icon: <ListPlus size={18} weight="bold" />,
                          onClick: () => requestAddToPlaylist(track),
                        },
                      ]}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </GlassPanel>
  );
}
