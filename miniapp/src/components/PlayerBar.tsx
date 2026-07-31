import { CircleNotch, HeartStraight, Pause, Play, SkipForward, WarningCircle } from "@phosphor-icons/react";
import { usePlayer } from "../lib/player";
import { useMyMusic } from "../lib/my-music";
import { ARTWORK_ROW, artworkUrl } from "../lib/artwork";

/** Global mini-player above the dock; rendered only while a track is loaded. */
export function PlayerBar({ onOpen }: { onOpen?: () => void }) {
  const player = usePlayer();
  const track = player.track;
  const { isSaved, isPending, toggleSaved } = useMyMusic();

  if (!track) return null;
  const { status } = player;
  const hasNext = player.queueIndex >= 0 && player.queueIndex < player.queue.length - 1;
  const liked = isSaved(track.uri);
  const liking = isPending(track.uri);

  function toggleLike(e: React.MouseEvent) {
    e.stopPropagation();
    if (!track) return;
    void toggleSaved(track);
  }

  const playIcon =
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
    <div className="player-bar glass">
      <button
        type="button"
        className="player-bar-open"
        aria-label="Открыть плеер"
        onClick={() => onOpen?.()}
      >
        {track.artwork ? (
          <img className="player-bar-thumbnail" src={artworkUrl(track.artwork, ARTWORK_ROW)} alt="" decoding="async" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
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
        className={`player-bar-btn player-bar-like-btn${liked ? " active" : ""}`}
        aria-label={liked ? "Убрать из моей музыки" : "Добавить в мою музыку"}
        aria-pressed={liked}
        disabled={liking}
        onClick={toggleLike}
      >
        <HeartStraight size={18} weight={liked ? "fill" : "bold"} />
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
        <SkipForward size={18} weight="fill" />
      </button>
    </div>
  );
}
