import { HeartStraight } from "@phosphor-icons/react";
import { useMyMusic, type MyMusicTrack } from "../lib/my-music";

/**
 * The one save/like affordance for a track row, shared by every screen that
 * lists tracks (artist, search, results, playlists, the mini player). Always
 * renders — a saved track fills accent, an unsaved one stays a plain
 * outline — so "not saved" reads as a real state instead of a missing icon.
 * Previously each screen had its own mix of a clickable heart, a
 * non-interactive one, or none at all (see ArtistScreen/SearchMode history).
 */
export function SaveTrackButton({ track, className }: { track: MyMusicTrack; className?: string }) {
  const { isSaved, isPending, toggleSaved } = useMyMusic();
  const saved = isSaved(track.uri);
  const pending = isPending(track.uri);
  const label = saved ? "Убрать из моей музыки" : "Добавить в мою музыку";

  return (
    <button
      type="button"
      className={["icon-btn", saved ? "active" : "", className].filter(Boolean).join(" ")}
      aria-label={label}
      aria-pressed={saved}
      title={label}
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation();
        void toggleSaved(track);
      }}
    >
      <HeartStraight size={18} weight={saved ? "fill" : "bold"} />
    </button>
  );
}
