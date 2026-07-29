import { useEffect, useState } from "react";
import { Check, CircleNotch, Eye, LinkBreak, MusicNotes, Sparkle, BookmarkSimple, WarningCircle, X } from "@phosphor-icons/react";
import { GlassPanel } from "../components/GlassPanel";
import { TrackRow } from "../components/TrackRow";
import { EmptyState } from "../components/EmptyState";
import { TrackSkeleton } from "../components/TrackSkeleton";
import { usePlayer } from "../lib/player";
import { ARTWORK_ROW, artworkUrl } from "../lib/artwork";
import { api, type SharedPlaylist, type Track } from "../lib/api";
import { requestAddTracksToPlaylist } from "../components/AddToPlaylistButton";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; share: SharedPlaylist }
  | { kind: "gone" }
  | { kind: "error"; message: string };


/** "1 трек" / "2 трека" / "5 треков" — Russian counts read wrong without this. */
function formatTrackCount(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const form = mod100 >= 11 && mod100 <= 14 ? "треков"
    : mod10 === 1 ? "трек"
    : mod10 >= 2 && mod10 <= 4 ? "трека"
    : "треков";
  return `${count} ${form}`;
}

function formatViewCount(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const form = mod100 >= 11 && mod100 <= 14 ? "просмотров"
    : mod10 === 1 ? "просмотр"
    : mod10 >= 2 && mod10 <= 4 ? "просмотра"
    : "просмотров";
  return `${count} ${form}`;
}

/**
 * 2×2 grid of the first four covers. A shared playlist arrives with no artwork
 * of its own, and four covers read as "a collection" the way a single cover
 * cannot. Falls back to a flat panel when the tracks carry no artwork at all.
 */
function Collage({ tracks }: { tracks: Track[] }) {
  const covers = tracks.map((t) => t.artwork).filter((a): a is string => Boolean(a)).slice(0, 4);
  if (covers.length === 0) {
    return (
      <div className="share-collage share-collage--empty" aria-hidden="true">
        <MusicNotes size={32} weight="fill" />
      </div>
    );
  }
  return (
    <div className="share-collage" aria-hidden="true">
      {/* One cover fills the square; two or three tile and repeat rather than
          leaving holes in the grid. */}
      {Array.from({ length: 4 }, (_, i) => covers[i % covers.length]!).map((cover, i) => (
        <CollageCover key={`${cover}-${i}`} src={artworkUrl(cover, ARTWORK_ROW)} />
      ))}
    </div>
  );
}

/** Fades a cover in once it decodes instead of popping in whenever the
 * browser happens to finish. The ref check covers the cached case, where
 * `onLoad` isn't reliable enough on its own to promise the image ever
 * appears. */
function CollageCover({ src }: { src: string | undefined }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className={loaded ? "loaded" : undefined}
      onLoad={() => setLoaded(true)}
      ref={(el) => {
        if (el?.complete) setLoaded(true);
      }}
    />
  );
}

export function SharedPlaylistScreen({
  token,
  onGenerateOwn,
}: {
  token: string;
  onGenerateOwn: (prompt: string | null) => void;
}) {
  const player = usePlayer();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [actionError, setActionError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  useEffect(() => {
    let stopped = false;
    api
      .getShare(token)
      .then((share) => {
        if (!stopped) setState({ kind: "ready", share });
      })
      .catch((e: unknown) => {
        if (stopped) return;
        const message = e instanceof Error ? e.message : String(e);
        // The server answers 404 for an unknown token and 410 for a revoked
        // one; both mean the same thing to whoever tapped the link.
        setState(/not found|revoked/i.test(message) ? { kind: "gone" } : { kind: "error", message });
      });
    return () => { stopped = true; };
  }, [token]);

  if (state.kind === "loading") {
    return (
      <GlassPanel className="reveal">
        <TrackSkeleton />
      </GlassPanel>
    );
  }

  if (state.kind === "gone") {
    return (
      <GlassPanel className="reveal">
        <EmptyState
          icon={<LinkBreak size={28} weight="bold" />}
          label="Ссылка больше не действует"
          action={{ label: "Собрать свой плейлист", onClick: () => onGenerateOwn(null) }}
        />
      </GlassPanel>
    );
  }

  if (state.kind === "error") {
    return (
      <GlassPanel className="reveal">
        <EmptyState
          icon={<LinkBreak size={28} weight="bold" />}
          label={state.message}
          action={{ label: "Собрать свой плейлист", onClick: () => onGenerateOwn(null) }}
        />
      </GlassPanel>
    );
  }

  const { share } = state;

  function playFrom(track: Track) {
    player.toggle(
      { uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork },
      share.tracks.map((t) => ({ uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork })),
    );
  }

  /**
   * Hands off to the shared add-to-playlist sheet rather than silently creating
   * a playlist named after the share: the recipient picks the destination, and
   * the sheet already handles creating a new one and the slot limit.
   */
  function handleSaveToMine() {
    requestAddTracksToPlaylist(
      share.tracks.map((t) => ({ uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork })),
      `«${share.name}» · ${formatTrackCount(share.tracks.length)}`,
      share.name,
    );
  }

  async function handleRevoke() {
    setRevoking(true);
    try {
      await api.revokeShare(share.token);
      setState({ kind: "gone" });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setRevoking(false);
    }
  }

  const byline = share.prompt
    ? share.author.name
      ? `${share.author.name} собрал по запросу «${share.prompt}»`
      : `Собрано по запросу «${share.prompt}»`
    : share.author.name
      ? `Подборка от ${share.author.name}`
      : "Подборка";

  return (
    <GlassPanel className="reveal">
      <div className="share-header">
        <Collage tracks={share.tracks} />
        <div className="share-header-text">
          <h1>{share.name}</h1>
          <p className="text-muted fs-label">{byline}</p>
          <p className="text-muted fs-label">{formatTrackCount(share.tracks.length)}</p>
        </div>
      </div>

      {share.isOwner ? (
        confirmRevoke ? (
          <div className="share-actions mt-16">
            <span className="text-muted fs-label share-cta">Отозвать ссылку без возможности восстановить?</span>
            <button
              type="button"
              className="action-btn action-btn--destructive"
              aria-label="Подтвердить отзыв ссылки"
              disabled={revoking}
              onClick={() => void handleRevoke()}
            >
              {revoking ? <CircleNotch size={18} weight="bold" className="spin" /> : <Check size={18} weight="bold" />}
            </button>
            <button type="button" className="action-btn" aria-label="Отмена" onClick={() => setConfirmRevoke(false)}>
              <X size={18} weight="bold" />
            </button>
          </div>
        ) : (
          <div className="share-actions mt-16">
            <span className="text-muted fs-label share-views">
              <Eye size={16} weight="bold" /> {formatViewCount(share.viewCount)}
            </span>
            <button type="button" className="glass-button" onClick={() => setConfirmRevoke(true)}>
              Отозвать ссылку
            </button>
          </div>
        )
      ) : (
        // «Сделать свой» carries the row: a recipient generating their own is
        // the whole point of the link, and two full-width labels here would
        // push the tracklist off the first screen.
        <div className="share-actions mt-16">
          <button type="button" className="glass-button primary share-cta" onClick={() => onGenerateOwn(share.prompt)}>
            <Sparkle size={18} weight="bold" /> Сделать свой
          </button>
          <button
            type="button"
            className="glass-button icon-only"
            aria-label="Сохранить в плейлист"
            title="Сохранить в плейлист"
            onClick={handleSaveToMine}
          >
            <BookmarkSimple size={18} weight="bold" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="error-row mt-12">
          <span className="error-row-icon">
            <WarningCircle size={16} weight="bold" />
          </span>
          <p role="alert" className="error-row-message">{actionError}</p>
        </div>
      )}

      <div className="stack mt-16 reveal-stagger">
        {share.tracks.map((track, i) => (
          <TrackRow
            key={track.uri}
            style={{ ["--i" as string]: i }}
            onClick={() => playFrom(track)}
            artwork={track.artwork}
            title={track.title}
            meta={track.artist}
          />
        ))}
      </div>
    </GlassPanel>
  );
}
