import { useEffect, useState } from "react";
import { CircleNotch, Heart, Pause, Play, SkipForward, WarningCircle } from "@phosphor-icons/react";
import { usePlayer } from "../lib/player";
import { api } from "../lib/api";

/** Global mini-player above the dock; rendered only while a track is loaded. */
export function PlayerBar({ onOpen }: { onOpen?: () => void }) {
  const player = usePlayer();
  const track = player.track;
  const [liked, setLiked] = useState(false);
  const [liking, setLiking] = useState(false);

  useEffect(() => {
    setLiked(false);
    if (!track) return;
    api
      .reactionStatus(track.uri)
      .then(({ liked }) => setLiked(liked))
      .catch(() => {});
  }, [track?.uri]);

  if (!track) return null;
  const { status } = player;
  const hasNext = player.queueIndex >= 0 && player.queueIndex < player.queue.length - 1;

  async function toggleLike(e: React.MouseEvent) {
    e.stopPropagation();
    if (!track || liking) return;
    setLiking(true);
    try {
      if (liked) {
        await api.removeMyMusic(track.uri);
        setLiked(false);
      } else {
        await api.addMyMusic({ uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork });
        setLiked(true);
      }
    } finally {
      setLiking(false);
    }
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
        className={`player-bar-btn player-bar-like-btn${liked ? " active" : ""}`}
        aria-label={liked ? "Убрать из избранного" : "Нравится"}
        disabled={liking}
        onClick={toggleLike}
      >
        <Heart size={18} weight={liked ? "fill" : "bold"} />
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
