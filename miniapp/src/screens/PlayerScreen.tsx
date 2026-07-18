import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  ArrowLeft,
  Heart,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  TextAlignLeft,
  ThumbsDown,
  WarningCircle,
  CircleNotch,
} from "@phosphor-icons/react";
import { usePlayer } from "../lib/player";
import { VolumeControl } from "../components/VolumeControl";
import { LyricsScreen } from "./LyricsScreen";
import { api } from "../lib/api";

const SWIPE_THRESHOLD = 80;

/**
 * Upgrade known low-res artwork URLs to a size that fills the fullscreen
 * artwork slot. YouTube Music thumbnails are googleusercontent URLs with an
 * inline `=wN-hN` size directive; SoundCloud serves `-large.jpg` (100x100)
 * with a `-t500x500.jpg` variant available.
 */
export function hiResArtwork(url: string): string {
  if (/googleusercontent\.com/.test(url)) {
    return url.replace(/=w\d+-h\d+/, "=w544-h544");
  }
  return url.replace(/-large\.(jpg|png)$/, "-t500x500.$1");
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
  const { status, progress, volume, muted, currentTime, duration } = player;
  const [artworkError, setArtworkError] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [reacting, setReacting] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);
  const swiping = useRef(false);

  // Drag state for the progress slider: while dragging, show the local ratio
  // instead of the live player progress and only commit the seek on release
  // (per design.md D3 — avoids re-seeking the audio element on every pixel).
  const progressTrackRef = useRef<HTMLDivElement>(null);
  const draggingProgress = useRef(false);
  const [dragRatio, setDragRatio] = useState<number | null>(null);

  useEffect(() => {
    setLiked(false);
    setDisliked(false);
    if (!track) return;
    api
      .reactionStatus(track.uri)
      .then(({ liked, disliked }) => {
        setLiked(liked);
        setDisliked(disliked);
      })
      .catch(() => {});
  }, [track?.uri]);

  async function toggleLike() {
    if (!track || reacting) return;
    setReacting(true);
    try {
      if (liked) {
        await api.removeMyMusic(track.uri);
        setLiked(false);
      } else {
        await api.addMyMusic({ uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork });
        setLiked(true);
        setDisliked(false);
      }
    } finally {
      setReacting(false);
    }
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
        setLiked(false);
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

  function handlePointerDown(e: PointerEvent) {
    // Swipe-to-close must not capture pointers aimed at controls: capturing
    // retargets pointerup to the container and the button click never fires.
    if ((e.target as HTMLElement).closest("button, [role='slider'], input")) return;
    startY.current = e.clientY;
    currentY.current = e.clientY;
    swiping.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!swiping.current) return;
    currentY.current = e.clientY;
    const dy = currentY.current - startY.current;
    if (dy > 0 && overlayRef.current) {
      overlayRef.current.style.transition = "none";
      overlayRef.current.style.transform = `translateY(${dy}px)`;
    }
  }

  function handlePointerUp(_e: PointerEvent) {
    if (!swiping.current) return;
    swiping.current = false;
    const dy = currentY.current - startY.current;
    if (dy > SWIPE_THRESHOLD) {
      if (overlayRef.current) {
        overlayRef.current.style.transition = "";
        overlayRef.current.style.transform = "";
      }
      onClose();
    } else {
      if (overlayRef.current) {
        overlayRef.current.style.transition = "";
        overlayRef.current.style.transform = "";
      }
    }
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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
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
              tabIndex={0}
              onPointerDown={handleProgressPointerDown}
              onPointerMove={handleProgressPointerMove}
              onPointerUp={handleProgressPointerUp}
              onPointerCancel={handleProgressPointerUp}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") player.seek(progress + 0.05);
                if (e.key === "ArrowLeft") player.seek(progress - 0.05);
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
              className={`player-screen-reaction-btn${disliked ? " active" : ""}`}
              aria-label={disliked ? "Убрать из нелюбимых" : "Не нравится"}
              disabled={!track || reacting}
              onClick={() => void toggleDislike()}
            >
              <ThumbsDown size={20} weight={disliked ? "fill" : "regular"} />
            </button>
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
            <button
              type="button"
              className={`player-screen-reaction-btn${liked ? " active" : ""}`}
              aria-label={liked ? "Убрать из избранного" : "Нравится"}
              disabled={!track || reacting}
              onClick={() => void toggleLike()}
            >
              <Heart size={20} weight={liked ? "fill" : "regular"} />
            </button>
          </div>
          <button
            type="button"
            className="player-screen-lyrics-btn"
            aria-label="Текст песни"
            disabled={!track}
            onClick={() => setShowLyrics(true)}
          >
            <TextAlignLeft size={16} weight="bold" /> Текст песни
          </button>
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
          track={{ title: track.title, artist: track.artist }}
          currentTime={currentTime}
          duration={duration}
          onSeek={(fraction) => player.seek(fraction)}
          onClose={() => setShowLyrics(false)}
        />
      )}
    </div>
  );
}
