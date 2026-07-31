import { useEffect, useState } from "react";
import { ArrowLeft, ArrowsClockwise, CaretRightIcon, CircleNotch, ListPlus, User, WarningCircle } from "@phosphor-icons/react";
import { TrackRow } from "../components/TrackRow";
import { TrackOverflowMenu } from "../components/TrackOverflowMenu";
import { SaveTrackButton } from "../components/SaveTrackButton";
import { requestAddToPlaylist } from "../components/AddToPlaylistButton";
import { api, type Album, type ArtistDetail, type Track } from "../lib/api";
import { usePlayer } from "../lib/player";
import { useDialog } from "../lib/useDialog";

type LoadState = { kind: "loading" } | { kind: "error" } | { kind: "ok"; data: ArtistDetail };
type AlbumState = { tracks: Track[]; status: "idle" | "loading" | "error" };

const compactRu = new Intl.NumberFormat("ru", { notation: "compact", maximumFractionDigits: 1 });

// Russian plural forms: 1 слушатель / 2 слушателя / 5 слушателей.
function pluralRu(n: number, [one, few, many]: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/**
 * Neither backend exposes anything like Spotify's monthly listeners, so this is
 * the raw follower/subscriber count — phrased as listeners because that is what
 * it means to a user browsing an artist.
 */
function followersLabel(n: number): string {
  return `${compactRu.format(n)} ${pluralRu(n, ["слушатель", "слушателя", "слушателей"])}`;
}

function playsLabel(n: number): string {
  return `${compactRu.format(n)} ${pluralRu(n, ["прослушивание", "прослушивания", "прослушиваний"])}`;
}

const BIO_PREVIEW_CHARS = 180;

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
  const [bioOpen, setBioOpen] = useState(false);
  // Non-nested (opened from a main screen): only the screen content goes
  // inert, so the dock/top-bar/player-bar stay reachable behind this card —
  // matching its own z-index comment (below the dock, above plain content).
  // Nested (opened from within the full player, which is itself modal) stays
  // fully modal like every other overlay.
  const dialogRef = useDialog<HTMLDivElement>(true, onClose, { inertScope: nested ? "shell" : "content" });

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
      <div className="player-screen glass artist-screen" ref={dialogRef} role="dialog" aria-modal="true" aria-label="Исполнитель">
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
              <span className="artist-screen-identity">
                <h1 className="artist-screen-name">{state.data.name}</h1>
                {/* Coverage differs per backend: SoundCloud reports followers,
                    YouTube Music reports none — so this row simply disappears. */}
                {typeof state.data.followers === "number" && state.data.followers > 0 && (
                  <span className="artist-screen-stat">{followersLabel(state.data.followers)}</span>
                )}
              </span>
            </div>

            {state.data.description && (
              <p className="artist-screen-bio">
                {bioOpen || state.data.description.length <= BIO_PREVIEW_CHARS
                  ? state.data.description
                  : `${state.data.description.slice(0, BIO_PREVIEW_CHARS).trimEnd()}…`}
                {state.data.description.length > BIO_PREVIEW_CHARS && (
                  <button
                    type="button"
                    className="artist-screen-bio-toggle"
                    aria-expanded={bioOpen}
                    onClick={() => setBioOpen((v) => !v)}
                  >
                    {bioOpen ? "Свернуть" : "Ещё"}
                  </button>
                )}
              </p>
            )}

            {state.data.topTracks.length > 0 && (
              <section className="search-section">
                <h2 className="search-section-title">Популярные треки</h2>
                <div className="stack reveal-stagger">
                  {state.data.topTracks.map((track, i) => (
                    <TrackRow
                      key={track.uri}
                      style={{ ["--i" as string]: i }}
                      onClick={() => player.toggle(track, queue)}
                      artwork={track.artwork}
                      title={track.title}
                      meta={
                        typeof track.playbackCount === "number" && track.playbackCount > 0
                          ? `${track.artist} · ${playsLabel(track.playbackCount)}`
                          : track.artist
                      }
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
                        <TrackRow
                          className="album-head"
                          onClick={() => void toggleAlbum(album)}
                          artwork={album.artwork}
                          title={album.title}
                          meta={album.artist}
                          metaClassName="search-row-meta"
                          trailing={
                            <span className={`album-chevron${open ? " open" : ""}`} aria-hidden>
                              <CaretRightIcon size={16} />
                            </span>
                          }
                        />
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
                              <TrackRow
                                key={track.uri}
                                className="track-sub"
                                onClick={() =>
                                  player.toggle(
                                    track,
                                    open.tracks.map((t) => ({ uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork })),
                                  )
                                }
                                artwork={track.artwork || album.artwork}
                                title={track.title}
                                meta={
                        typeof track.playbackCount === "number" && track.playbackCount > 0
                          ? `${track.artist} · ${playsLabel(track.playbackCount)}`
                          : track.artist
                      }
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
