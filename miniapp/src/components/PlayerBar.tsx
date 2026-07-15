import { CircleNotch, Pause, Play, SkipForward, WarningCircle } from "@phosphor-icons/react";
import { usePlayer, type PlayerTrackInfo } from "../lib/player";

/** Play/pause toggle for a track row; reflects the shared player's state. */
export function TrackPlayButton({ track, queue, stopPropagation, onBeforePlay }: { track: PlayerTrackInfo; queue?: PlayerTrackInfo[]; stopPropagation?: boolean; onBeforePlay?: () => boolean | void }) {
  const player = usePlayer();
  const isActive = player.track?.uri === track.uri;
  const status = isActive ? player.status : "idle";

  const icon =
    status === "loading" ? (
      <CircleNotch size={18} weight="bold" className="spin" />
    ) : status === "playing" ? (
      <Pause size={18} weight="fill" />
    ) : status === "error" ? (
      <WarningCircle size={18} weight="bold" />
    ) : (
      <Play size={18} weight="fill" />
    );

  return (
    <button
      type="button"
      className={`icon-btn play-btn${isActive ? " active" : ""}`}
      aria-label={status === "playing" ? `Пауза: ${track.title}` : `Слушать: ${track.title}`}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        if (onBeforePlay?.() === false) return;
        player.toggle(track, queue);
      }}
    >
      {icon}
    </button>
  );
}

/** Global mini-player above the dock; rendered only while a track is loaded. */
export function PlayerBar({ onOpen }: { onOpen?: () => void }) {
  const player = usePlayer();
  if (!player.track) return null;
  const { track, status } = player;
  const hasNext = player.queueIndex >= 0 && player.queueIndex < player.queue.length - 1;

  const playIcon =
    status === "loading" ? (
      <CircleNotch size={22} weight="bold" className="spin" />
    ) : status === "playing" ? (
      <Pause size={22} weight="fill" />
    ) : status === "error" ? (
      <WarningCircle size={22} weight="bold" />
    ) : (
      <Play size={22} weight="fill" />
    );

  return (
    <div className="player-bar glass">
      <button
        type="button"
        className="player-bar-open"
        aria-label="Открыть плеер"
        onClick={() => onOpen?.()}
      >
        {track.artwork ? (
          <img className="player-bar-thumbnail" src={track.artwork} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="player-bar-thumbnail" aria-hidden="true" />
        )}
        <span className="player-info">
          <span className="player-title">{track.title}</span>
          <span className="player-artist text-muted">
            {status === "error" ? "Не удалось воспроизвести" : track.artist}
          </span>
        </span>
      </button>
      <button
        type="button"
        className="player-bar-btn"
        aria-label={status === "playing" ? `Пауза: ${track.title}` : `Слушать: ${track.title}`}
        onClick={() => player.toggle(track)}
      >
        {playIcon}
      </button>
      <button
        type="button"
        className="player-bar-btn"
        aria-label="Следующий трек"
        disabled={!hasNext}
        onClick={() => player.nextTrack()}
      >
        <SkipForward size={22} weight="fill" />
      </button>
    </div>
  );
}
