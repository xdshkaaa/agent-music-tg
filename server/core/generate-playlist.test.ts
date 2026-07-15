import { describe, expect, test } from "bun:test";
import type { AgentMessage, AgentProvider, AgentResult, ToolSpec } from "../agent/types";
import type { MusicProvider, RemotePlaylist, Track } from "../music/types";
import {
  ClarifyNeededError,
  DEFAULT_MAX_ITERATIONS,
  MaxIterationsExceededError,
  NoTracksResolvedError,
  generatePlaylist,
} from "./generate-playlist";
import { mapWithConcurrency, withTimeout } from "./concurrency";

function fakeProvider(turns: AgentResult[]): AgentProvider & { calls: number } {
  const state = { calls: 0 };
  return {
    id: "fake",
    calls: 0,
    async generateMessages(_system: string, _messages: AgentMessage[], _tools: ToolSpec[]): Promise<AgentResult> {
      const turn = turns[state.calls] ?? turns.at(-1)!;
      state.calls++;
      this.calls = state.calls;
      return turn;
    },
  };
}

function fakeMusic(opts: { remotePlaylists: boolean; searchTrack?: (artist: string, title: string) => Promise<Track | null> }) {
  const searchTrackCalls: string[] = [];
  const music: MusicProvider & { searchTrackCalls: string[] } = {
    name: "youtube-music",
    capabilities: { remotePlaylists: opts.remotePlaylists, remotePlayback: opts.remotePlaylists },
    searchTrackCalls,
    async searchTrack(artist, title) {
      searchTrackCalls.push(`${artist}|${title}`);
      if (opts.searchTrack) return opts.searchTrack(artist, title);
      return { uri: `ytm:${artist}-${title}`, title, artist };
    },
    async searchTracks(query) {
      return [{ uri: `ytm:q-${query}`, title: query, artist: "Q" }];
    },
    async searchArtist(name) {
      return { id: `id-${name}`, name };
    },
    async getArtistTopTracks() {
      return [];
    },
    ...(opts.remotePlaylists
      ? {
          async createPlaylist(name: string): Promise<RemotePlaylist> {
            return { id: "pl1", uri: "ytm:playlist:pl1", url: "https://music.youtube.com/playlist?list=pl1", name };
          },
          async addTracksToPlaylist() {},
        }
      : {}),
  };
  return music;
}

function finalizeResult(name: string, tracks: { artist: string; title: string }[]): AgentResult {
  return {
    text: "",
    toolCalls: [{ id: "call-final", name: "finalize_playlist", args: { name, tracks } }],
  };
}

function searchTracksResult(id: string, query: string): AgentResult {
  return {
    text: "",
    toolCalls: [{ id, name: "searchTracks", args: { query } }],
  };
}

function searchResult(id: string, artist: string, title: string): AgentResult {
  return {
    text: "",
    toolCalls: [{ id, name: "searchTrack", args: { artist, title } }],
  };
}

describe("generatePlaylist", () => {
  test("finalizes against a playlist-capable backend (creates a real playlist)", async () => {
    const provider = fakeProvider([finalizeResult("Vibes", [{ artist: "A", title: "One" }])]);
    const music = fakeMusic({ remotePlaylists: true });
    const { playlist } = await generatePlaylist({ provider, music, prompt: "chill vibes" });
    expect(playlist.name).toBe("Vibes");
    expect(playlist.tracks).toHaveLength(1);
    expect(playlist.remotePlaylistUrl).toBe("https://music.youtube.com/playlist?list=pl1");
  });

  test("finalizes against a resolve-only backend (no remote playlist created)", async () => {
    const provider = fakeProvider([finalizeResult("Vibes", [{ artist: "A", title: "One" }])]);
    const music = fakeMusic({ remotePlaylists: false });
    const { playlist } = await generatePlaylist({ provider, music, prompt: "chill vibes" });
    expect(playlist.tracks).toHaveLength(1);
    expect(playlist.remotePlaylistUrl).toBeUndefined();
  });

  test("exceeds max iterations without finalize_playlist", async () => {
    const provider = fakeProvider([searchResult("c1", "A", "One")]);
    const music = fakeMusic({ remotePlaylists: true });
    await expect(generatePlaylist({ provider, music, prompt: "endless research", maxIterations: 3 })).rejects.toThrow(
      MaxIterationsExceededError,
    );
  });

  test("duplicate tool call is not re-dispatched against the backend", async () => {
    const provider = fakeProvider([
      searchResult("c1", "A", "One"),
      { text: "", toolCalls: [{ id: "c2", name: "searchTrack", args: { artist: "A", title: "One" } }] },
      finalizeResult("Vibes", [{ artist: "A", title: "One" }]),
    ]);
    const music = fakeMusic({ remotePlaylists: true });
    await generatePlaylist({ provider, music, prompt: "repeat search" });
    // Called once for the first searchTrack turn; the duplicate call in turn 2 must
    // reuse the cached result, and turn 3's finalize resolve also reuses the cache.
    expect(music.searchTrackCalls).toEqual(["A|One"]);
  });

  test("first clarify call surfaces as ClarifyNeededError", async () => {
    const provider = fakeProvider([
      { text: "", toolCalls: [{ id: "c1", name: "clarify", args: { question: "Which mood?", options: ["a", "b", "c"] } }] },
    ]);
    const music = fakeMusic({ remotePlaylists: true });
    await expect(generatePlaylist({ provider, music, prompt: "something" })).rejects.toThrow(ClarifyNeededError);
  });

  test("a second clarify attempt after resume is rejected, not asked again", async () => {
    const provider = fakeProvider([
      { text: "", toolCalls: [{ id: "c2", name: "clarify", args: { question: "Again?", options: ["a", "b", "c"] } }] },
      finalizeResult("Vibes", [{ artist: "A", title: "One" }]),
    ]);
    const music = fakeMusic({ remotePlaylists: true });
    const resumeMessages: AgentMessage[] = [
      { role: "user", content: "something" },
      { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "clarify", args: { question: "Which mood?", options: ["a", "b", "c"] } }] },
    ];
    const { playlist } = await generatePlaylist({
      provider,
      music,
      prompt: "something",
      resumeMessages,
      resumeClarifyAnswer: "a",
    });
    expect(playlist.name).toBe("Vibes");
  });

  test("default max iterations constant is sane", () => {
    expect(DEFAULT_MAX_ITERATIONS).toBeGreaterThan(0);
  });

  test("fails the run when the backend resolves zero tracks (no silent empty playlist)", async () => {
    const provider = fakeProvider([finalizeResult("Vibes", [{ artist: "A", title: "One" }, { artist: "B", title: "Two" }])]);
    const music = fakeMusic({ remotePlaylists: false, searchTrack: async () => null });
    await expect(generatePlaylist({ provider, music, prompt: "anything" })).rejects.toThrow(NoTracksResolvedError);
  });

  test("keeps partial playlist when only some tracks resolve", async () => {
    const provider = fakeProvider([finalizeResult("Vibes", [{ artist: "A", title: "One" }, { artist: "B", title: "Two" }])]);
    const music = fakeMusic({
      remotePlaylists: false,
      searchTrack: async (artist, title) => (artist === "A" ? { uri: "ytm:a", title, artist } : null),
    });
    const { playlist } = await generatePlaylist({ provider, music, prompt: "anything" });
    expect(playlist.tracks).toHaveLength(1);
  });

  test("builds a playlist directly from a free-text searchTracks result (short named-work query)", async () => {
    const track = { artist: "Q", title: "kyokai no kanata soundtrack" };
    const provider = fakeProvider([searchTracksResult("c1", "kyokai no kanata soundtrack"), finalizeResult("OST", [track])]);
    const music = fakeMusic({ remotePlaylists: false });
    const { playlist } = await generatePlaylist({ provider, music, prompt: "kyokai no kanata soundtrack" });
    expect(playlist.name).toBe("OST");
    expect(playlist.tracks).toHaveLength(1);
    expect(playlist.tracks[0]!.title).toBe("kyokai no kanata soundtrack");
  });
});

describe("mapWithConcurrency", () => {
  test("preserves input order and respects the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 12 }, (_, i) => i);
    const out = await mapWithConcurrency(items, 3, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 2;
    });
    expect(out).toEqual(items.map((n) => n * 2));
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  test("propagates errors", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });
});

describe("withTimeout", () => {
  test("resolves fallback on timeout, value when fast", async () => {
    const slow = new Promise<string>((r) => setTimeout(() => r("late"), 100));
    expect(await withTimeout(slow, 10, "fallback")).toBe("fallback");
    expect(await withTimeout(Promise.resolve("fast"), 100, "fallback")).toBe("fast");
  });
});
