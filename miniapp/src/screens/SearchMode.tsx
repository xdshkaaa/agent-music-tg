import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle,
  CircleNotch,
  DownloadSimple,
  ListPlus,
  MagnifyingGlass,
  CaretRightIcon,
  User,
  WarningCircle,
} from "@phosphor-icons/react";
import { TrackRow } from "../components/TrackRow";
import { TrackOverflowMenu } from "../components/TrackOverflowMenu";
import { SaveTrackButton } from "../components/SaveTrackButton";
import { requestAddToPlaylist } from "../components/AddToPlaylistButton";
import { api, type Album, type ArtistCard, type SuggestionsResponse, type Track } from "../lib/api";
import { humanizeError } from "../lib/errorText";
import { usePlayer } from "../lib/player";
import { buildSearchFeed, isSearchFeedEmpty, loadRecentSearches, pushRecentSearch } from "../lib/suggestions";
import { useScrollFade } from "../lib/useScrollFade";

type DownloadState = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

type AlbumState = {
  tracks: Track[];
  status: "idle" | "loading" | "error";
  error: string | null;
};

export interface ArtistHit {
  name: string;
  artwork: string | null;
}

/** Rank unique artist names from tracks + albums, preferring exact / prefix matches. */
export function deriveArtists(query: string, tracks: Track[], albums: Album[], limit = 6): ArtistHit[] {
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

export function SearchMode({
  query,
  suggestions,
  onOpenArtist,
  onPickQuery,
}: {
  query: string;
  suggestions: SuggestionsResponse;
  onOpenArtist: (target: { id?: string; name?: string }) => void;
  onPickQuery: (q: string) => void;
}) {
  const player = usePlayer();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [serverArtists, setServerArtists] = useState<ArtistCard[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "error">("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, AlbumState>>({});
  const [trackDownloads, setTrackDownloads] = useState<Record<string, DownloadState>>({});
  const [recent, setRecent] = useState<string[]>(() => loadRecentSearches());
  const requestId = useRef(0);
  const artistRailRef = useRef<HTMLDivElement>(null);
  useScrollFade(artistRailRef);

  const artists: (ArtistHit & { id?: string })[] = useMemo(() => {
    if (!query.trim()) return [];
    if (serverArtists.length > 0) {
      return serverArtists.map((a) => ({ id: a.id, name: a.name, artwork: a.artwork ?? null }));
    }
    return deriveArtists(query, tracks, albums);
  }, [query, tracks, albums, serverArtists]);

  const hasResults = tracks.length > 0 || albums.length > 0 || artists.length > 0;
  const queryActive = query.trim().length > 0;

  useEffect(() => {
    const q = query.trim();
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
      Promise.allSettled([api.search(q, 20), api.searchAlbums(q, 12)]).then(([trackRes, albumRes]) => {
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
        setRecent(pushRecentSearch(q));
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

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

  function playLibraryTrack(uri: string) {
    const queue = feed.tracks.map((t) => ({ uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork ?? undefined }));
    const current = queue.find((t) => t.uri === uri);
    if (current) player.toggle(current, queue);
  }

  // --- Empty state ---------------------------------------------------------

  const feed = buildSearchFeed(suggestions, recent);

  if (!queryActive) {
    if (isSearchFeedEmpty(feed)) return null;
    return (
      <>
        {feed.recent.length > 0 && (
          <section className="search-section">
            <h2 className="search-section-title">Недавние поиски</h2>
            <div className="search-recent">
              {feed.recent.map((q) => (
                <button key={q} type="button" className="search-recent-chip" onClick={() => onPickQuery(q)}>
                  <MagnifyingGlass size={14} weight="bold" />
                  <span>{q}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {feed.artists.length > 0 && (
          <section className="search-section">
            <h2 className="search-section-title">Ваши исполнители</h2>
            <div className="search-artist-rail" ref={artistRailRef}>
              {feed.artists.map((artist) => (
                <button
                  key={artist.name}
                  type="button"
                  className="search-artist-tile"
                  aria-label={`Открыть исполнителя ${artist.name}`}
                  onClick={() => onOpenArtist({ name: artist.name })}
                >
                  <span className="search-artist-tile-avatar" aria-hidden>
                    {artist.artwork ? <img src={artist.artwork} alt="" /> : <User size={22} weight="bold" />}
                  </span>
                  <span className="search-artist-tile-name">{artist.name}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {feed.tracks.length > 0 && (
          <section className="search-section">
            <h2 className="search-section-title">Из вашей музыки</h2>
            <div className="stack reveal-stagger">
              {feed.tracks.map((track, i) => (
                <TrackRow
                  key={track.uri}
                  style={{ ["--i" as string]: i }}
                  onClick={() => playLibraryTrack(track.uri)}
                  artwork={track.artwork ?? undefined}
                  title={track.title}
                  meta={track.artist}
                  metaClassName="search-row-meta"
                  trailing={<SaveTrackButton track={track} />}
                />
              ))}
            </div>
          </section>
        )}

        {feed.genres.length > 0 && (
          <section className="search-section">
            <h2 className="search-section-title">Жанры</h2>
            <div className="search-recent">
              {feed.genres.map((genre) => (
                <button key={genre} type="button" className="search-recent-chip" onClick={() => onPickQuery(genre)}>
                  <span>{genre}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </>
    );
  }

  // --- Results -------------------------------------------------------------

  return (
    <>
      {searchStatus === "loading" && !hasResults && (
        <p className="text-muted search-status" role="status">
          <CircleNotch size={16} className="spin" /> Ищу…
        </p>
      )}

      {searchStatus === "error" && (
        <div className="error-row search-status">
          <span className="error-row-icon">
            <WarningCircle size={16} weight="bold" />
          </span>
          <p role="alert" className="error-row-message">
            {humanizeError(searchError ?? "").message}
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
                className="track-row search-artist-row search-artist-card"
                style={{ ["--i" as string]: i }}
                aria-label={`Открыть исполнителя ${name}`}
                onClick={() => onOpenArtist(id ? { id } : { name })}
              >
                <span className="search-artist-avatar" aria-hidden>
                  {artwork ? <img src={artwork} alt="" /> : <User size={22} weight="bold" />}
                </span>
                <div className="search-artist-copy">
                  <p className="search-row-title">{name}</p>
                  <p className="text-muted search-row-meta">Исполнитель</p>
                </div>
                <span className="search-artist-enter" aria-hidden>
                  <CaretRightIcon size={17} weight="bold" />
                </span>
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
              const albumLabel =
                dl?.kind === "sending" ? "Отправляю альбом…" : dl?.kind === "sent" ? "Отправлено в чат" : "Сохранить альбом";
              return (
                <div className="album-block" key={album.uri} style={{ ["--i" as string]: i }}>
                  <TrackRow
                    className="album-head"
                    onClick={() => void toggleAlbum(album)}
                    // SoundCloud albums carry no artwork_url of their own, so
                    // borrow a cover from the tracks once they are loaded.
                    artwork={album.artwork ?? open?.tracks.find((t) => t.artwork)?.artwork}
                    title={album.title}
                    meta={album.artist}
                    metaClassName="search-row-meta"
                    trailing={
                      <>
                        <button
                          type="button"
                          className="icon-btn track-download-btn"
                          aria-label={albumLabel}
                          title={albumLabel}
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
                      </>
                    }
                  />
                  {open && (
                    <div className="album-tracks">
                      {open.status === "loading" && (
                        <p className="text-muted album-tracks-note">
                          <CircleNotch size={14} className="spin" /> Загружаю треки…
                        </p>
                      )}
                      {open.status === "error" && (
                        <p className="text-muted album-tracks-note" role="alert">
                          {humanizeError(open.error ?? "").message}
                        </p>
                      )}
                      {open.status === "idle" && open.tracks.length === 0 && (
                        <p className="text-muted album-tracks-note">Пусто</p>
                      )}
                      {open.tracks.map((track) => {
                        const queue = open.tracks.map((t) => ({
                          uri: t.uri,
                          title: t.title,
                          artist: t.artist,
                          artwork: t.artwork,
                        }));
                        const play = () =>
                          player.toggle(
                            { uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork },
                            queue,
                          );
                        return (
                          <TrackRow
                            key={track.uri}
                            className="track-sub"
                            onClick={play}
                            artwork={track.artwork || album.artwork}
                            title={track.title}
                            meta={track.artist}
                            metaClassName="search-row-meta"
                            trailing={
                              <>
                                <SaveTrackButton track={track} />
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
                              </>
                            }
                          />
                        );
                      })}
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
              <TrackRow
                key={track.uri}
                style={{ ["--i" as string]: i }}
                onClick={() =>
                  player.toggle(
                    { uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork },
                    tracks.map((t) => ({ uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork })),
                  )
                }
                artwork={track.artwork}
                title={track.title}
                meta={track.artist}
                metaClassName="search-row-meta"
                trailing={
                  <>
                    {trackDownloads[track.uri]?.kind === "sent" && (
                      <CheckCircle size={16} weight="fill" style={{ color: "var(--accent)" }} />
                    )}
                    {trackDownloads[track.uri]?.kind === "sending" && (
                      <CircleNotch size={16} className="spin" style={{ color: "var(--text-muted)" }} />
                    )}
                    <SaveTrackButton track={track} />
                    <TrackOverflowMenu
                      actions={[
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
                  </>
                }
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
