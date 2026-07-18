import { ListPlus } from "@phosphor-icons/react";
import type { Track } from "../lib/api";

export interface AddToPlaylistTrack {
  uri: string;
  title: string;
  artist: string;
  artwork?: string;
}

export const OPEN_ADD_TO_PLAYLIST_EVENT = "open-add-to-playlist";

export function requestAddToPlaylist(track: AddToPlaylistTrack): void {
  window.dispatchEvent(new CustomEvent<AddToPlaylistTrack>(OPEN_ADD_TO_PLAYLIST_EVENT, { detail: track }));
}

/** Icon button next to Play — opens the shared add-to-playlist bottom sheet. */
export function AddToPlaylistButton({ track, stopPropagation }: { track: Track; stopPropagation?: boolean }) {
  return (
    <button
      type="button"
      className="icon-btn add-to-playlist-btn"
      aria-label="Добавить в плейлист"
      title="Добавить в плейлист"
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        requestAddToPlaylist({ uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork });
      }}
    >
      <ListPlus size={18} weight="bold" />
    </button>
  );
}
