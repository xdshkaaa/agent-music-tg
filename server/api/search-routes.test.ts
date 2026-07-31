import { describe, expect, test } from "bun:test";
import { prewarmPlayback } from "./search-routes";

describe("plain-search playback prewarm", () => {
  test("starts resolving the first two tracks without waiting for playback", async () => {
    const calls: string[] = [];
    const resolver = {
      async resolve(uri: string) {
        calls.push(uri);
        return { url: `https://media.example/${uri}`, headers: {} };
      },
      invalidate() {},
    };
    const tracks = ["ytm:first", "ytm:second", "ytm:third"].map((uri, index) => ({
      uri,
      title: `Track ${index}`,
      artist: "Artist",
    }));

    prewarmPlayback(tracks, resolver);
    await Promise.resolve();

    expect(calls).toEqual(["ytm:first", "ytm:second"]);
  });

  test("keeps a failed background resolve from becoming an unhandled rejection", async () => {
    const resolver = {
      async resolve() { throw new Error("unavailable"); },
      invalidate() {},
    };

    prewarmPlayback([{ uri: "ytm:dead", title: "Dead", artist: "Artist" }], resolver);
    await Promise.resolve();
    await Promise.resolve();
  });
});
