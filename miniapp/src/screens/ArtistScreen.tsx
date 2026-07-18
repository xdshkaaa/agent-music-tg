import { useEffect, useState } from "react";
import { ArrowLeft, ArrowsClockwise, CaretRightIcon, CircleNotch, HeartStraight, ListPlus, User, WarningCircle } from "@phosphor-icons/react";
import { TrackOverflowMenu } from "../components/TrackOverflowMenu";
import { requestAddToPlaylist } from "../components/AddToPlaylistButton";
import { api, type Album, type ArtistDetail, type Track } from "../lib/api";
import { usePlayer } from "../lib/player";

type LoadState = { kind: "loading" } | { kind: "error" } | { kind: "ok"; data: ArtistDetail };
type AlbumState = { tracks: Track[]; status: "idle" | "loading" | "error" };

export function ArtistScreen({
  target,
  onClose,
  nested,
}: {
  target: { id?: string; name?: string };
  onClose: () => void;
  nested?: boolean;
}) {
  const player = usePlayer();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [expanded, setExpanded] = useState<Record<string, AlbumState>>({});
  const [savedTracks, setSavedTracks] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.myMusic().then(({ tracks }) => setSavedTracks(Object.fromEntries(tracks.map((t) => [t.uri, true])))).catch(() => {});
  }, []);

  async function toggleSaved(track: Track) {
    const isSaved = !!savedTracks[track.uri];
    setSaving((m) => ({ ...m, [track.uri]: true }));
    try {
      if (isSaved) {
        await api.removeMyMusic(track.uri);
        setSavedTracks((m) => ({ ...m, [track.uri]: false }));
      } else {
        await api.addMyMusic({ uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork });
        setSavedTracks((m) => ({ ...m, [track.uri]: true }));
      }
    } finally {
      setSaving((m) => ({ ...m, [track.uri]: false }));
    }
  }

  async function toggleAlbum(album: Album) {
    if (expanded[album.uri]) {
      setExpanded((m) => {
        const next = { ...m };
        delete next[album.uri];
        return next;
      });
      return;
    }
    setExpanded((m) => ({ ...m, [album.uri]: { tracks: [], status: "loading" } }));
    try {
      const { tracks } = await api.albumTracks(album.uri);
      setExpanded((m) => ({ ...m, [album.uri]: { tracks, status: "idle" } }));
    } catch {
      setExpanded((m) => ({ ...m, [album.uri]: { tracks: [], status: "error" } }));
    }
  }

  function load() {
    setState({ kind: "loading" });
    api
      .artist(target)
      .then((data) => setState({ kind: "ok", data }))
      .catch(() => setState({ kind: "error" }));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.id, target.name]);

  const queue =
    state.kind === "ok"
      ? state.data.topTracks.map((t) => ({ uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork }))
      : [];

  return (
    <div className={`player-screen-overlay artist-screen-overlay${nested ? " artist-screen-overlay--nested" : ""}`}>
      <div className="player-screen glass artist-screen">
        <div className="player-screen-header">
          <button type="button" className="action-btn action-btn--neutral" aria-label="Назад" onClick={onClose}>
            <ArrowLeft size={24} />
          </button>
          <span className="player-screen-header-label">Исполнитель</span>
        </div>

        {state.kind === "loading" && (
          <div className="artist-screen-skeleton">
            <div className="artist-screen-avatar-skeleton" />
            <div className="artist-screen-line-skeleton" style={{ width: "60%" }} />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="artist-screen-row-skeleton" />
            ))}
          </div>
        )}

        {state.kind === "error" && (
          <div className="search-empty" style={{ padding: "40px 0" }}>
            <WarningCircle size={32} weight="bold" />
            <p className="search-empty-title">Не удалось загрузить исполнителя</p>
            <button type="button" className="glass-button" onClick={load}>
              <ArrowsClockwise size={16} weight="bold" /> Повторить
            </button>
          </div>
        )}

        {state.kind === "ok" && (
          <div className="artist-screen-body">
            <div className="artist-screen-head">
              <span className="artist-screen-avatar" aria-hidden>
                {state.data.artwork ? <img src={state.data.artwork} alt="" /> : <User size={32} weight="bold" />}
              </span>
              <h1 className="artist-screen-name">{state.data.name}</h1>
            </div>

            {state.data.topTracks.length > 0 && (
              <section className="search-section">
                <h2 className="search-section-title">Популярные треки</h2>
                <div className="stack reveal-stagger">
                  {state.data.topTracks.map((track, i) => (
                    <div
                      className="track-row"
                      key={track.uri}
                      style={{ ["--i" as string]: i }}
                      role="button"
                      tabIndex={0}
                      onClick={() => player.toggle(track, queue)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        player.toggle(track, queue);
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
                      {savedTracks[track.uri] && <HeartStraight size={16} weight="fill" style={{ color: "var(--accent)" }} />}
                      <TrackOverflowMenu
                        actions={[
                          {
                            key: "save",
                            label: savedTracks[track.uri] ? "Убрать из моей музыки" : "Добавить в мою музыку",
                            icon: <HeartStraight size={18} weight={savedTracks[track.uri] ? "fill" : "bold"} />,
                            disabled: !!saving[track.uri],
                            onClick: () => void toggleSaved(track),
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

            {state.data.albums.length > 0 && (
              <section className="search-section">
                <h2 className="search-section-title">Альбомы</h2>
                <div className="stack reveal-stagger">
                  {state.data.albums.map((album, i) => {
                    const open = expanded[album.uri];
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
                              <p className="text-muted" style={{ padding: "4px 8px" }}>Не удалось загрузить</p>
                            )}
                            {open.tracks.map((track) => (
                              <div
                                className="track-row track-sub"
                                key={track.uri}
                                role="button"
                                tabIndex={0}
                                onClick={() =>
                                  player.toggle(
                                    track,
                                    open.tracks.map((t) => ({ uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork })),
                                  )
                                }
                                onKeyDown={(e) => {
                                  if (e.key !== "Enter" && e.key !== " ") return;
                                  e.preventDefault();
                                  player.toggle(
                                    track,
                                    open.tracks.map((t) => ({ uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork })),
                                  );
                                }}
                              >
                                {track.artwork || album.artwork ? (
                                  <img className="track-artwork" src={track.artwork || album.artwork} alt="" />
                                ) : (
                                  <div className="track-artwork" />
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p className="search-row-title">{track.title}</p>
                                  <p className="text-muted search-row-meta">{track.artist}</p>
                                </div>
                                {savedTracks[track.uri] && <HeartStraight size={16} weight="fill" style={{ color: "var(--accent)" }} />}
                                <TrackOverflowMenu
                                  actions={[
                                    {
                                      key: "save",
                                      label: savedTracks[track.uri] ? "Убрать из моей музыки" : "Добавить в мою музыку",
                                      icon: <HeartStraight size={18} weight={savedTracks[track.uri] ? "fill" : "bold"} />,
                                      disabled: !!saving[track.uri],
                                      onClick: () => void toggleSaved(track),
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
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {state.data.topTracks.length === 0 && state.data.albums.length === 0 && (
              <div className="search-empty">
                <p className="search-empty-title">Пока нечего показать</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
