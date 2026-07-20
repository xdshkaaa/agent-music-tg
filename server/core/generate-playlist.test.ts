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
  const searchTracksCalls: string[] = [];
  const music: MusicProvider & { searchTrackCalls: string[]; searchTracksCalls: string[] } = {
    name: "youtube-music",
    capabilities: { remotePlaylists: opts.remotePlaylists, remotePlayback: opts.remotePlaylists },
    searchTrackCalls,
    searchTracksCalls,
    async searchTrack(artist, title) {
      searchTrackCalls.push(`${artist}|${title}`);
      if (opts.searchTrack) return opts.searchTrack(artist, title);
      return { uri: `ytm:${artist}-${title}`, title, artist };
    },
    async searchTracks(query) {
      searchTracksCalls.push(query);
      return [{ uri: `ytm:q-${query}`, title: query, artist: "Q" }];
    },
    async searchArtist(name) {
      return { id: `id-${name}`, name };
    },
    async getArtistTopTracks() {
      return [];
    },
    async searchArtists() {
      return [];
    },
    async getArtistAlbums() {
      return [];
    },
    async searchAlbums() {
      return [];
    },
    async getAlbumTracks() {
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

function addToPlaylistResult(id: string, tracks: { artist: string; title: string }[]): AgentResult {
  return {
    text: "",
    toolCalls: [{ id, name: "add_to_playlist", args: { tracks } }],
  };
}

describe("generatePlaylist", () => {
  test("hard-filters disliked uris from the finalized result", async () => {
    const provider = fakeProvider([
      finalizeResult("Test", [
        { artist: "Burial", title: "Archangel" },
        { artist: "Four Tet", title: "Baby" },
      ]),
    ]);
    const music = fakeMusic({ remotePlaylists: false });
    const { playlist } = await generatePlaylist({
      provider,
      music,
      prompt: "test",
      dislikedUris: new Set(["ytm:Burial-Archangel"]),
    });
    expect(playlist.tracks.map((t) => t.uri)).toEqual(["ytm:Four Tet-Baby"]);
  });

  test("injects a capped dislike exclusion note into the initial prompt", async () => {
    let seenMessages: AgentMessage[] = [];
    const provider: AgentProvider = {
      id: "fake",
      async generateMessages(_system, messages) {
        seenMessages = messages;
        return finalizeResult("Test", [{ artist: "A", title: "One" }]);
      },
    };
    const music = fakeMusic({ remotePlaylists: false });
    await generatePlaylist({ provider, music, prompt: "test", dislikedTracks: ["Burial - Archangel"] });
    expect(seenMessages.some((m) => m.role === "user" && m.content.includes("Burial - Archangel"))).toBe(true);
  });

  test("onEvent emits structured tool_call/tool_result pairs with matching ids", async () => {
    const events: unknown[] = [];
    const provider = fakeProvider([
      searchResult("call-1", "Burial", "Archangel"),
      finalizeResult("Test", [{ artist: "Burial", title: "Archangel" }]),
    ]);
    const music = fakeMusic({ remotePlaylists: false });

    await generatePlaylist({ provider, music, prompt: "test", onEvent: (e) => events.push(e) });

    const call = events.find((e) => (e as { kind: string }).kind === "tool_call") as
      | { kind: string; id: string; name: string; args: Record<string, unknown> }
      | undefined;
    const result = events.find((e) => (e as { kind: string }).kind === "tool_result") as
      | { kind: string; id: string; ok: boolean; result: unknown }
      | undefined;

    expect(call).toBeDefined();
    expect(call?.id).toBe("call-1");
    expect(call?.name).toBe("searchTrack");
    expect(call?.args).toEqual({ artist: "Burial", title: "Archangel" });

    expect(result).toBeDefined();
    expect(result?.id).toBe("call-1");
    expect(result?.ok).toBe(true);
  });

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

  test("first clarify call surfaces as ClarifyNeededError with round 1", async () => {
    const provider = fakeProvider([
      { text: "", toolCalls: [{ id: "c1", name: "clarify", args: { question: "Which mood?", options: ["a", "b", "c"] } }] },
    ]);
    const music = fakeMusic({ remotePlaylists: true });
    let caught: unknown;
    try {
      await generatePlaylist({ provider, music, prompt: "something" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ClarifyNeededError);
    expect((caught as ClarifyNeededError).round).toBe(1);
  });

  const resumeMessagesAfterOneClarify: AgentMessage[] = [
    { role: "user", content: "something" },
    { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "clarify", args: { question: "Which mood?", options: ["a", "b", "c"] } }] },
  ];

  test("a second clarify call within the same run throws round 2, not rejected", async () => {
    const provider = fakeProvider([
      { text: "", toolCalls: [{ id: "c2", name: "clarify", args: { question: "Which genre?", options: ["a", "b", "c"] } }] },
    ]);
    const music = fakeMusic({ remotePlaylists: true });
    let caught: unknown;
    try {
      await generatePlaylist({
        provider,
        music,
        prompt: "something",
        resumeMessages: resumeMessagesAfterOneClarify,
        resumeClarifyAnswer: "a",
        resumeClarifyRound: 1,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ClarifyNeededError);
    expect((caught as ClarifyNeededError).round).toBe(2);
  });

  test("a third clarify call within the same run throws round 3", async () => {
    const provider = fakeProvider([
      { text: "", toolCalls: [{ id: "c3", name: "clarify", args: { question: "Which era?", options: ["a", "b", "c"] } }] },
    ]);
    const music = fakeMusic({ remotePlaylists: true });
    let caught: unknown;
    try {
      await generatePlaylist({
        provider,
        music,
        prompt: "something",
        resumeMessages: resumeMessagesAfterOneClarify,
        resumeClarifyAnswer: "a",
        resumeClarifyRound: 2,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ClarifyNeededError);
    expect((caught as ClarifyNeededError).round).toBe(3);
  });

  test("a fourth clarify attempt past the cap is rejected, agent must finalize", async () => {
    const provider = fakeProvider([
      { text: "", toolCalls: [{ id: "c4", name: "clarify", args: { question: "Again?", options: ["a", "b", "c"] } }] },
      finalizeResult("Vibes", [{ artist: "A", title: "One" }]),
    ]);
    const music = fakeMusic({ remotePlaylists: true });
    const { playlist } = await generatePlaylist({
      provider,
      music,
      prompt: "something",
      resumeMessages: resumeMessagesAfterOneClarify,
      resumeClarifyAnswer: "a",
      resumeClarifyRound: 3,
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

  test("candidate ranking adds no LLM turn or backend search", async () => {
    const provider = fakeProvider([
      searchTracksResult("c1", "shoegaze"),
      finalizeResult("Dream Wall", [{ artist: "Q", title: "shoegaze" }]),
    ]);
    const music = fakeMusic({ remotePlaylists: false });
    let rankCalls = 0;

    await generatePlaylist({
      provider,
      music,
      prompt: "шугейз",
      systemPrompt: "base\n\nLOCAL MUSIC CONTEXT: shoegaze",
      rankTracks(tracks) {
        rankCalls++;
        return tracks;
      },
    });

    expect(provider.calls).toBe(2);
    expect(music.searchTracksCalls).toEqual(["shoegaze"]);
    expect(rankCalls).toBe(1);
  });

  test("extend mode: add_to_playlist accumulates and finalize merges with the base, deduping base tracks", async () => {
    const baseTracks = [{ artist: "A", title: "One" }];
    // Agent tries to re-add a base track (A) and a new track (B); A must be ignored.
    const provider = fakeProvider([
      addToPlaylistResult("c1", [
        { artist: "B", title: "Two" },
        { artist: "A", title: "One" },
      ]),
      finalizeResult("", []),
    ]);
    const music = fakeMusic({ remotePlaylists: false });
    const { playlist } = await generatePlaylist({
      provider,
      music,
      prompt: "add more",
      mode: "extend",
      baseTracks,
      baseName: "Base",
    });
    expect(playlist.name).toBe("Base");
    expect(playlist.tracks.map((t) => `${t.artist}|${t.title}`).sort()).toEqual(["A|One", "B|Two"]);
  });

  test("extend mode: does not throw when only the base resolves but additions fail", async () => {
    const baseTracks = [{ artist: "A", title: "One" }];
    const provider = fakeProvider([
      addToPlaylistResult("c1", [{ artist: "Ghost", title: "Nowhere" }]),
      finalizeResult("", []),
    ]);
    const music = fakeMusic({ remotePlaylists: false, searchTrack: async (artist) => (artist === "A" ? { uri: "ytm:a", title: "One", artist: "A" } : null) });
    const { playlist } = await generatePlaylist({
      provider,
      music,
      prompt: "add a missing track",
      mode: "extend",
      baseTracks,
      baseName: "Base",
    });
    expect(playlist.tracks).toHaveLength(1);
    expect(playlist.tracks[0]!.artist).toBe("A");
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
