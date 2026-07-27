import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { __resetSearchCacheForTests, withQueryCache, withTrackCache } from "./search-cache";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

let now = 0;

beforeEach(() => {
  now = 1_000_000;
  __resetSearchCacheForTests(() => now);
});

afterEach(() => {
  __resetSearchCacheForTests(null);
});

describe("withQueryCache", () => {
  test("serves a repeat lookup from cache instead of calling the backend again", async () => {
    let calls = 0;
    const fetch = async () => {
      calls++;
      return [{ uri: "ytm:1" }];
    };
    await withQueryCache("youtube-music", "tracks", "dream pop", 20, fetch);
    const second = await withQueryCache("youtube-music", "tracks", "dream pop", 20, fetch);
    expect(calls).toBe(1);
    expect(second).toEqual([{ uri: "ytm:1" }]);
  });

  test("normalizes case and surrounding whitespace into one entry", async () => {
    let calls = 0;
    const fetch = async () => {
      calls++;
      return [{ uri: "ytm:1" }];
    };
    await withQueryCache("youtube-music", "tracks", "Dream Pop", 20, fetch);
    await withQueryCache("youtube-music", "tracks", "  dream pop ", 20, fetch);
    expect(calls).toBe(1);
  });

  test("concurrent misses on the same key share a single upstream call", async () => {
    let calls = 0;
    let release: (v: unknown[]) => void = () => {};
    const fetch = () => {
      calls++;
      return new Promise<unknown[]>((resolve) => {
        release = resolve;
      });
    };
    const all = Promise.all([
      withQueryCache("youtube-music", "tracks", "trending", 20, fetch),
      withQueryCache("youtube-music", "tracks", "trending", 20, fetch),
      withQueryCache("youtube-music", "tracks", "trending", 20, fetch),
    ]);
    release([{ uri: "ytm:1" }]);
    const results = await all;
    expect(calls).toBe(1);
    expect(results).toEqual([[{ uri: "ytm:1" }], [{ uri: "ytm:1" }], [{ uri: "ytm:1" }]]);
  });

  test("a rejection is not cached, so the next caller retries", async () => {
    let calls = 0;
    const flaky = async () => {
      calls++;
      if (calls === 1) throw new Error("upstream down");
      return [{ uri: "ytm:1" }];
    };
    await expect(withQueryCache("youtube-music", "tracks", "q", 20, flaky)).rejects.toThrow("upstream down");
    expect(await withQueryCache("youtube-music", "tracks", "q", 20, flaky)).toEqual([{ uri: "ytm:1" }]);
    expect(calls).toBe(2);
  });

  test("an empty result expires in a minute so a stalled backend self-heals", async () => {
    let calls = 0;
    const fetch = async () => {
      calls++;
      // Mirrors the backends' withTimeout fallback: a stall resolves to [].
      return calls === 1 ? [] : [{ uri: "ytm:1" }];
    };
    expect(await withQueryCache("youtube-music", "tracks", "q", 20, fetch)).toEqual([]);
    // Still cached moments later — one stall must not stampede the backend.
    now += 30 * 1000;
    expect(await withQueryCache("youtube-music", "tracks", "q", 20, fetch)).toEqual([]);
    expect(calls).toBe(1);

    now += 31 * 1000;
    expect(await withQueryCache("youtube-music", "tracks", "q", 20, fetch)).toEqual([{ uri: "ytm:1" }]);
    expect(calls).toBe(2);
  });

  test("a real result keeps the long TTL", async () => {
    let calls = 0;
    const fetch = async () => {
      calls++;
      return [{ uri: "ytm:1" }];
    };
    await withQueryCache("youtube-music", "tracks", "q", 20, fetch);
    now += 5 * HOUR;
    await withQueryCache("youtube-music", "tracks", "q", 20, fetch);
    expect(calls).toBe(1);

    now += 2 * HOUR;
    await withQueryCache("youtube-music", "tracks", "q", 20, fetch);
    expect(calls).toBe(2);
  });

  test("different backends and kinds never collide", async () => {
    const seen: string[] = [];
    const fetchFor = (label: string) => async () => {
      seen.push(label);
      return [{ uri: label }];
    };
    await withQueryCache("youtube-music", "tracks", "q", 20, fetchFor("ytm-tracks"));
    await withQueryCache("soundcloud", "tracks", "q", 20, fetchFor("sc-tracks"));
    await withQueryCache("youtube-music", "albums", "q", 20, fetchFor("ytm-albums"));
    expect(seen).toEqual(["ytm-tracks", "sc-tracks", "ytm-albums"]);
  });
});

describe("withTrackCache", () => {
  test("caches a resolved track and a not-found result separately from queries", async () => {
    let calls = 0;
    const fetch = async () => {
      calls++;
      return { uri: "ytm:abc", title: "One", artist: "A" };
    };
    await withTrackCache("youtube-music", "A", "One", fetch);
    await withTrackCache("youtube-music", "a", " one ", fetch);
    expect(calls).toBe(1);
  });

  test("a null (not found) track is retried after the short TTL", async () => {
    let calls = 0;
    const fetch = async () => {
      calls++;
      return calls === 1 ? null : { uri: "ytm:abc", title: "One", artist: "A" };
    };
    expect(await withTrackCache("youtube-music", "A", "One", fetch)).toBeNull();
    now += MINUTE + 1;
    expect(await withTrackCache("youtube-music", "A", "One", fetch)).not.toBeNull();
    expect(calls).toBe(2);
  });
});
