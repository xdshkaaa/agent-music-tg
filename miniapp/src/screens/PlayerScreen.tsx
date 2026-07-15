import { useRef, useState, type PointerEvent } from "react";
import {
  ArrowLeft,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  WarningCircle,
  CircleNotch,
} from "@phosphor-icons/react";
import { usePlayer } from "../lib/player";
import { VolumeControl } from "../components/VolumeControl";

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

export function PlayerScreen({ onClose }: { onClose: () => void }) {
  const player = usePlayer();
  const track = player.track;
  const { status, progress, volume, muted, currentTime, duration } = player;
  const [artworkError, setArtworkError] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);
  const swiping = useRef(false);

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
          <p className="player-screen-artist text-muted">
            {status === "error"
              ? "Не удалось воспроизвести"
              : track?.artist ?? ""}
          </p>
        </div>

        <div className="player-screen-progress-wrap">
          <div className="player-screen-time-row">
            {showTime && (
              <span className="player-screen-time player-screen-time-current">{formatTime(currentTime)}</span>
            )}
            <div
              className="player-screen-progress"
              role="slider"
              aria-label="Прогресс"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
              tabIndex={0}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                player.seek((e.clientX - rect.left) / rect.width);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") player.seek(progress + 0.05);
                if (e.key === "ArrowLeft") player.seek(progress - 0.05);
              }}
            >
              <span
                className="player-screen-progress-fill"
                style={{ transform: `scaleX(${progress})` }}
              />
              <span
                className="player-screen-progress-thumb"
                style={{ left: `${progress * 100}%` }}
              />
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
          <VolumeControl
            volume={volume}
            muted={muted}
            onSetVolume={player.setVolume}
            onToggleMute={player.toggleMute}
            variant="screen"
          />
        </div>
      </div>
    </div>
  );
}
