import { describe, expect, test, afterEach } from "bun:test";
import {
  OPEN_ADD_TO_PLAYLIST_EVENT,
  requestAddToPlaylist,
  requestAddTracksToPlaylist,
  type AddToPlaylistRequest,
} from "./AddToPlaylistButton";

const originalWindow = (globalThis as { window?: unknown }).window;

function captureRequest(run: () => void): AddToPlaylistRequest {
  let captured: AddToPlaylistRequest | null = null;
  (globalThis as { window: unknown }).window = {
    dispatchEvent(e: CustomEvent<AddToPlaylistRequest>) {
      expect(e.type).toBe(OPEN_ADD_TO_PLAYLIST_EVENT);
      captured = e.detail;
      return true;
    },
  };
  run();
  if (!captured) throw new Error("no event dispatched");
  return captured;
}

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("add-to-playlist requests", () => {
  test("a single track becomes a one-item request labelled with title and artist", () => {
    const detail = captureRequest(() =>
      requestAddToPlaylist({ uri: "ytm:a", title: "Malo 2.0", artist: "Мэйби Бэйби" }),
    );
    expect(detail.tracks).toHaveLength(1);
    expect(detail.tracks[0]!.uri).toBe("ytm:a");
    expect(detail.label).toBe("«Malo 2.0» — Мэйби Бэйби");
    // No suggested name: a single track does not imply a playlist name.
    expect(detail.suggestedName).toBeUndefined();
  });

  test("a shared playlist carries every track and prefills the new-playlist name", () => {
    const tracks = [
      { uri: "ytm:a", title: "One", artist: "A" },
      { uri: "ytm:b", title: "Two", artist: "B" },
      { uri: "ytm:c", title: "Three", artist: "C" },
    ];
    const detail = captureRequest(() =>
      requestAddTracksToPlaylist(tracks, "«Вечерний драйв» · 3 трека", "Вечерний драйв"),
    );
    expect(detail.tracks).toHaveLength(3);
    expect(detail.tracks.map((t) => t.uri)).toEqual(["ytm:a", "ytm:b", "ytm:c"]);
    expect(detail.label).toBe("«Вечерний драйв» · 3 трека");
    expect(detail.suggestedName).toBe("Вечерний драйв");
  });
});
