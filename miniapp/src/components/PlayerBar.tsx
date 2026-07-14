import { CircleNotch, Pause, Play, WarningCircle } from "@phosphor-icons/react";
import { usePlayer, type PlayerTrackInfo } from "../lib/player";
import { VolumeControl } from "./VolumeControl";

/** Play/pause toggle for a track row; reflects the shared player's state. */
export function TrackPlayButton({ track, stopPropagation, onBeforePlay }: { track: PlayerTrackInfo; stopPropagation?: boolean; onBeforePlay?: () => void }) {
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
        onBeforePlay?.();
        player.toggle(track);
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
  const { track, status, progress } = player;

  return (
    <div
      className={`player-bar glass${status === "playing" || status === "loading" ? " liquid-glow" : ""}`}
      role="button"
      aria-label="Открыть плеер"
      tabIndex={0}
      onClick={() => onOpen?.()}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen?.(); }}
    >
      <div className="player-bar-row">
        {track.artwork ? (
          <img className="player-bar-thumbnail" src={track.artwork} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        ) : null}
        <TrackPlayButton track={track} stopPropagation />
        <div className="player-info">
          <p className="player-title">{track.title}</p>
          <p className="player-artist text-muted">
            {status === "error" ? "Не удалось воспроизвести" : track.artist}
          </p>
        </div>
      </div>
      <div className="player-bar-divider" />
      <div className="player-bar-row">
        <div
          className="player-progress"
          role="slider"
          aria-label="Прогресс"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            player.seek((e.clientX - rect.left) / rect.width);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") player.seek(progress + 0.05);
            if (e.key === "ArrowLeft") player.seek(progress - 0.05);
          }}
        >
          <span className="player-progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
        <VolumeControl
          volume={player.volume}
          muted={player.muted}
          onSetVolume={player.setVolume}
          onToggleMute={player.toggleMute}
          variant="bar"
          stopPropagation
        />
      </div>
    </div>
  );
}
