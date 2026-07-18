import { describe, expect, test } from "bun:test";
import { openDb, type AppDb } from "../db";
import { getLyrics, parseLrc } from "./lyrics";

function freshDb(): AppDb {
  return openDb(":memory:");
}

describe("parseLrc", () => {
  test("parses timestamped lines in order", () => {
    const lrc = "[00:01.00]First line\n[00:02.50]Second line\n[01:00.00]Third line";
    const lines = parseLrc(lrc);
    expect(lines).toEqual([
      { t: 1, line: "First line" },
      { t: 2.5, line: "Second line" },
      { t: 60, line: "Third line" },
    ]);
  });

  test("ignores metadata lines without a timestamp", () => {
    const lrc = "[ar:Artist]\n[ti:Title]\n[00:05.00]Only real line";
    expect(parseLrc(lrc)).toEqual([{ t: 5, line: "Only real line" }]);
  });

  test("sorts out-of-order timestamps", () => {
    const lrc = "[00:10.00]Second\n[00:01.00]First";
    expect(parseLrc(lrc)).toEqual([
      { t: 1, line: "First" },
      { t: 10, line: "Second" },
    ]);
  });

  test("handles empty input", () => {
    expect(parseLrc("")).toEqual([]);
  });
});

describe("lyrics cache", () => {
  test("caches a synced result and skips the network on the next call", async () => {
    const db = freshDb();
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify({ syncedLyrics: "[00:01.00]Hi", plainLyrics: null }), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const first = await getLyrics(db, "Artist", "Title");
      expect(first).toEqual({ kind: "synced", lines: [{ t: 1, line: "Hi" }] });
      expect(calls).toBe(1);
      const second = await getLyrics(db, "Artist", "Title");
      expect(second).toEqual({ kind: "synced", lines: [{ t: 1, line: "Hi" }] });
      expect(calls).toBe(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("caches a not-found result", async () => {
    const db = freshDb();
    const originalFetch = global.fetch;
    global.fetch = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    try {
      const result = await getLyrics(db, "Unknown", "Nothing");
      expect(result).toEqual({ kind: "notFound" });
    } finally {
      global.fetch = originalFetch;
    }
  });
});
