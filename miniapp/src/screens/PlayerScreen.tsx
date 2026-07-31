import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  ArrowLeft,
  HeartStraight,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  TextAlignLeft,
  ThumbsDown,
  WarningCircle,
  CircleNotch,
} from "@phosphor-icons/react";
import { usePlayer, usePlayerTime } from "../lib/player";
import { useMyMusic } from "../lib/my-music";
import { VolumeControl } from "../components/VolumeControl";
import { LyricsScreen } from "./LyricsScreen";
import { api } from "../lib/api";
import { ARTWORK_FULL, artworkUrl } from "../lib/artwork";
import { useDialog } from "../lib/useDialog";
import { shouldEngageVerticalSwipe } from "../lib/swipeGesture";

const SWIPE_THRESHOLD = 80;
type SwipeState = "idle" | "pending" | "swiping" | "rejected";

/**
 * Upgrade known low-res artwork URLs to a size that fills the fullscreen
 * artwork slot — the inverse of what the list rows ask for (see lib/artwork.ts).
 */
export function hiResArtwork(url: string): string {
  return artworkUrl(url, ARTWORK_FULL) ?? url;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlayerScreen({
  onClose,
  onOpenArtist,
}: {
  onClose: () => void;
  onOpenArtist: (name: string) => void;
}) {
  const player = usePlayer();
  const track = player.track;
  const { status, volume, muted } = player;
  const { progress, currentTime, duration } = usePlayerTime();
  const [artworkError, setArtworkError] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [reacting, setReacting] = useState(false);
  const { isSaved, isPending, toggleSaved } = useMyMusic();

  const overlayRef = useDialog<HTMLDivElement>(true, onClose);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentY = useRef(0);
  // "pending" until travel clears a slop and picks a dominant axis (see
  // shouldEngageVerticalSwipe) — only then does the gesture actually start
  // moving the card. "rejected" once a horizontal drag has been identified,
  // so the rest of that same gesture is ignored instead of re-evaluated on
  // every subsequent pointermove.
  const swipeState = useRef<SwipeState>("idle");
  const rafId = useRef<number | null>(null);

  // Drag state for the progress slider: while dragging, show the local ratio
  // instead of the live player progress and only commit the seek on release
  // (per design.md D3 — avoids re-seeking the audio element on every pixel).
  const progressTrackRef = useRef<HTMLDivElement>(null);
  const draggingProgress = useRef(false);
  const [dragRatio, setDragRatio] = useState<number | null>(null);

  useEffect(() => {
    // Closing mid-swipe (e.g. via the back button while dragging) must not
    // leave a stale rAF callback writing to overlayRef after unmount.
    return () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    };
  }, []);

  useEffect(() => {
    setDisliked(false);
    // Per-track, not sticky: without this one dead cover URL kept the
    // placeholder up for every track played afterwards.
    setArtworkError(false);
    if (!track) return;
    // "liked" now comes from the shared my-music store (see toggleLike below)
    // — reactionStatus is only consulted here for "disliked", which has no
    // other source of truth.
    api
      .reactionStatus(track.uri)
      .then(({ disliked }) => setDisliked(disliked))
      .catch(() => {});
  }, [track?.uri]);

  function toggleLike() {
    if (!track) return;
    void toggleSaved(track);
  }

  async function toggleDislike() {
    if (!track || reacting) return;
    setReacting(true);
    try {
      if (disliked) {
        await api.undislikeTrack(track.uri);
        setDisliked(false);
      } else {
        await api.dislikeTrack({ uri: track.uri, title: track.title, artist: track.artist });
        setDisliked(true);
      }
    } finally {
      setReacting(false);
    }
  }

  function ratioFromPointer(clientX: number): number {
    const rect = progressTrackRef.current!.getBoundingClientRect();
    return Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  }

  function handleProgressPointerDown(e: PointerEvent) {
    draggingProgress.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragRatio(ratioFromPointer(e.clientX));
  }

  function handleProgressPointerMove(e: PointerEvent) {
    if (!draggingProgress.current) return;
    setDragRatio(ratioFromPointer(e.clientX));
  }

  function handleProgressPointerUp(e: PointerEvent) {
    if (!draggingProgress.current) return;
    draggingProgress.current = false;
    const ratio = ratioFromPointer(e.clientX);
    setDragRatio(null);
    player.seek(ratio);
  }

  function resetCardTransform() {
    if (rafId.current != null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    if (overlayRef.current) {
      overlayRef.current.style.transition = "";
      overlayRef.current.style.transform = "";
    }
  }

  function handlePointerDown(e: PointerEvent) {
    // Swipe-to-close must not capture pointers aimed at controls: capturing
    // retargets pointerup to the container and the button click never fires.
    if ((e.target as HTMLElement).closest("button, [role='slider'], input")) return;
    // Desktop has the back button and Escape — a mouse drag anywhere on the
    // card would otherwise read as an attempted swipe-to-close.
    if (e.pointerType === "mouse") return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    currentY.current = e.clientY;
    // Not "swiping" yet — see shouldEngageVerticalSwipe. Pointer capture is
    // deferred to the same moment, so a mostly-horizontal drag never grabs
    // the pointer away from whatever it was aimed at.
    swipeState.current = "pending";
  }

  function handlePointerMove(e: PointerEvent) {
    const state = swipeState.current;
    if (state === "idle" || state === "rejected") return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;

    if (state === "pending") {
      if (!shouldEngageVerticalSwipe(dx, dy)) {
        // Only reject once the horizontal axis is clearly ahead — small,
        // still-ambiguous travel stays "pending" so a gesture that starts
        // diagonally can still resolve to a vertical swipe a moment later.
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
          swipeState.current = "rejected";
        }
        return;
      }
      swipeState.current = "swiping";
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }

    currentY.current = e.clientY;
    // Coalesce every pointermove between frames into one style write instead
    // of one per event — pointermove can fire far faster than the display.
    if (rafId.current != null) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      const liveDy = currentY.current - startY.current;
      if (liveDy > 0 && overlayRef.current) {
        overlayRef.current.style.transition = "none";
        overlayRef.current.style.transform = `translateY(${liveDy}px)`;
      }
    });
  }

  function handlePointerUp(_e: PointerEvent) {
    const wasSwiping = swipeState.current === "swiping";
    swipeState.current = "idle";
    if (!wasSwiping) return;
    const dy = currentY.current - startY.current;
    resetCardTransform();
    if (dy > SWIPE_THRESHOLD) onClose();
  }

  function handlePointerCancel(_e: PointerEvent) {
    // Interrupted mid-gesture (e.g. the OS takes the pointer for its own
    // back-swipe) — without this the card could be left translated off
    // its resting position with no matching pointerup to undo it.
    swipeState.current = "idle";
    resetCardTransform();
  }

  const playIcon =
    status === "loading" ? (
      <CircleNotch size={36} weight="bold" className="spin" />
    ) : status === "playing" ? (
      <Pause size={36} weight="fill" />
    ) : status === "error" ? (
      <WarningCircle size={36} weight="bold" />
    ) : (
      <Play size={36} weight="fill" />
    );

  const showTime = duration > 0;

  return (
    <div className="player-screen-overlay">
      <div
        ref={overlayRef}
        className="player-screen glass"
        role="dialog"
        aria-modal="true"
        aria-label="Плеер"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div className="player-screen-header">
          <button
            type="button"
            className="action-btn action-btn--neutral"
            aria-label="Закрыть плеер"
            onClick={onClose}
          >
            <ArrowLeft size={24} />
          </button>
          <span className="player-screen-header-label">Сейчас играет</span>
        </div>

        <div className="player-screen-artwork">
          {track?.artwork && !artworkError ? (
            <img
              className="player-screen-artwork-img"
              src={hiResArtwork(track.artwork)}
              alt=""
              loading="lazy"
              onError={() => setArtworkError(true)}
            />
          ) : (
            <div className="player-screen-artwork-placeholder" />
          )}
        </div>

        <div className="player-screen-info">
          <p className="player-screen-title">{track?.title ?? ""}</p>
          {status === "error" ? (
            <p className="player-screen-artist text-muted">Не удалось воспроизвести</p>
          ) : (
            <button
              type="button"
              className="player-screen-artist player-screen-artist-link text-muted"
              disabled={!track}
              onClick={() => track && onOpenArtist(track.artist)}
            >
              {track?.artist ?? ""}
            </button>
          )}
        </div>

        <div className="player-screen-progress-wrap">
          <div className="player-screen-time-row">
            {showTime && (
              <span className="player-screen-time player-screen-time-current">
                {formatTime(dragRatio != null ? dragRatio * duration : currentTime)}
              </span>
            )}
            <div
              ref={progressTrackRef}
              className="player-screen-progress-hit"
              role="slider"
              aria-label="Прогресс"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((dragRatio ?? progress) * 100)}
              aria-valuetext={
                showTime
                  ? `${formatTime(dragRatio != null ? dragRatio * duration : currentTime)} из ${formatTime(duration)}`
                  : undefined
              }
              tabIndex={0}
              onPointerDown={handleProgressPointerDown}
              onPointerMove={handleProgressPointerMove}
              onPointerUp={handleProgressPointerUp}
              onPointerCancel={handleProgressPointerUp}
              onKeyDown={(e) => {
                switch (e.key) {
                  case "ArrowRight":
                  case "ArrowUp":
                    e.preventDefault();
                    player.seek(progress + 0.05);
                    break;
                  case "ArrowLeft":
                  case "ArrowDown":
                    e.preventDefault();
                    player.seek(progress - 0.05);
                    break;
                  case "Home":
                    e.preventDefault();
                    player.seek(0);
                    break;
                  case "End":
                    e.preventDefault();
                    player.seek(1);
                    break;
                }
              }}
            >
              <div className={`player-screen-progress${dragRatio != null ? " dragging" : ""}`}>
                <span
                  className="player-screen-progress-fill"
                  style={{ transform: `scaleX(${dragRatio ?? progress})` }}
                />
                <span
                  className="player-screen-progress-thumb"
                  style={{ left: `${(dragRatio ?? progress) * 100}%` }}
                />
              </div>
            </div>
            {showTime && (
              <span className="player-screen-time player-screen-time-duration">{formatTime(duration)}</span>
            )}
          </div>
        </div>

        <div className="player-screen-controls">
          <div className="player-screen-controls-row">
            <button
              type="button"
              className="player-screen-skip-btn"
              aria-label="Предыдущий трек"
              disabled={player.queueIndex <= 0}
              onClick={() => player.previousTrack()}
            >
              <SkipBack size={26} weight="fill" />
            </button>
            <button
              type="button"
              className="player-screen-play-btn"
              aria-label={status === "playing" ? "Пауза" : "Играть"}
              onClick={() => player.toggle(track!)}
            >
              {playIcon}
            </button>
            <button
              type="button"
              className="player-screen-skip-btn"
              aria-label="Следующий трек"
              disabled={player.queueIndex >= player.queue.length - 1}
              onClick={() => player.nextTrack()}
            >
              <SkipForward size={26} weight="fill" />
            </button>
          </div>
          {/* Neither the heart nor dislike/lyrics is a transport control, so
              all three sit below the transport row instead of bookending it —
              a 4th item there would unbalance the row around the play button
              (see DESIGN.md). */}
          <div className="player-screen-secondary-row">
            <button
              type="button"
              className={`player-screen-reaction-btn${track && isSaved(track.uri) ? " active" : ""}`}
              aria-label={track && isSaved(track.uri) ? "Убрать из моей музыки" : "Добавить в мою музыку"}
              aria-pressed={!!track && isSaved(track.uri)}
              disabled={!track || isPending(track.uri)}
              onClick={toggleLike}
            >
              <HeartStraight size={20} weight={track && isSaved(track.uri) ? "fill" : "regular"} />
            </button>
            <button
              type="button"
              className={`player-screen-reaction-btn${disliked ? " active" : ""}`}
              aria-label={disliked ? "Убрать из нелюбимых" : "Не нравится"}
              disabled={!track || reacting}
              onClick={() => void toggleDislike()}
            >
              <ThumbsDown size={20} weight={disliked ? "fill" : "regular"} />
            </button>
            <button
              type="button"
              className="player-screen-lyrics-btn"
              aria-label="Текст песни"
              disabled={!track}
              onClick={() => setShowLyrics(true)}
            >
              <TextAlignLeft size={16} weight="bold" /> Текст песни
            </button>
          </div>
          <VolumeControl
            volume={volume}
            muted={muted}
            onSetVolume={player.setVolume}
            onToggleMute={player.toggleMute}
            variant="screen"
          />
        </div>
      </div>

      {showLyrics && track && (
        <LyricsScreen
          track={{ title: track.title, artist: track.artist, artwork: track.artwork }}
          currentTime={currentTime}
          duration={duration}
          onSeek={(fraction) => player.seek(fraction)}
          onClose={() => setShowLyrics(false)}
        />
      )}
    </div>
  );
}
