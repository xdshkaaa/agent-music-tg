import { describe, expect, test } from "bun:test";
import { matchesTrack, titleSimilarity } from "./alternate-source";
import type { Track } from "../music/types";

function track(partial: Partial<Track>): Track {
  return { uri: "sc:1", title: "T", artist: "A", ...partial };
}

describe("titleSimilarity", () => {
  test("ignores platform noise around the same song", () => {
    expect(titleSimilarity("Blinding Lights", "Blinding Lights (Official Video)")).toBe(1);
    expect(titleSimilarity("Blinding Lights", "Blinding Lights [HD Audio]")).toBe(1);
  });

  test("separates different songs by the same artist", () => {
    expect(titleSimilarity("Blinding Lights", "Save Your Tears")).toBe(0);
  });
});

describe("matchesTrack", () => {
  const meta = { title: "Blinding Lights", artist: "The Weeknd", durationMs: 200_000 };

  test("accepts the same song with a decorated title", () => {
    expect(matchesTrack(meta, track({ title: "Blinding Lights (Official Audio)", artist: "The Weeknd" }))).toBe(true);
  });

  test("accepts a partial title match when the artist lines up", () => {
    expect(matchesTrack(meta, track({ title: "Blinding Lights - Live at Wembley 2022", artist: "Weeknd" }))).toBe(true);
  });

  test("rejects a different song", () => {
    expect(matchesTrack(meta, track({ title: "Save Your Tears", artist: "The Weeknd" }))).toBe(false);
  });

  test("rejects an hour-long mix that merely mentions the title", () => {
    expect(
      matchesTrack(meta, track({ title: "Blinding Lights", artist: "DJ Mix", durationMs: 3_600_000 })),
    ).toBe(false);
  });

  test("accepts a candidate whose duration is unknown", () => {
    expect(matchesTrack(meta, track({ title: "Blinding Lights", artist: "The Weeknd" }))).toBe(true);
  });
});
