import { ListPlus } from "@phosphor-icons/react";
import type { Track } from "../lib/api";

export interface AddToPlaylistTrack {
  uri: string;
  title: string;
  artist: string;
  artwork?: string;
}

/**
 * What the sheet was asked to add. One track and a whole shared playlist are
 * the same operation with a different count, so they go through one payload
 * rather than two sheets that would drift apart.
 */
export interface AddToPlaylistRequest {
  tracks: AddToPlaylistTrack[];
  /** Line shown under the sheet title, describing what is being added. */
  label: string;
  /** Prefills the "create playlist" field — a shared playlist brings its name. */
  suggestedName?: string;
}

export const OPEN_ADD_TO_PLAYLIST_EVENT = "open-add-to-playlist";

function open(request: AddToPlaylistRequest): void {
  window.dispatchEvent(new CustomEvent<AddToPlaylistRequest>(OPEN_ADD_TO_PLAYLIST_EVENT, { detail: request }));
}

export function requestAddToPlaylist(track: AddToPlaylistTrack): void {
  open({ tracks: [track], label: `«${track.title}» — ${track.artist}` });
}

/** Bulk variant: saving a received playlist into one of the user's own. */
export function requestAddTracksToPlaylist(
  tracks: AddToPlaylistTrack[],
  label: string,
  suggestedName?: string,
): void {
  open({ tracks, label, suggestedName });
}

/** Icon button next to Play — opens the shared add-to-playlist bottom sheet. */
export function AddToPlaylistButton({ track, stopPropagation }: { track: Track; stopPropagation?: boolean }) {
  return (
    <button
      type="button"
      className="icon-btn"
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
