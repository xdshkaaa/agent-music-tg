import { describe, expect, test } from "bun:test";
import type { AgentMessage, AgentProvider, AgentResult, ToolSpec } from "../agent/types";
import type { MusicProvider, RemotePlaylist, Track } from "../music/types";
import {
  ClarifyNeededError,
  DEFAULT_MAX_ITERATIONS,
  MaxIterationsExceededError,
  generatePlaylist,
} from "./generate-playlist";

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
    name: "spotify",
    capabilities: { remotePlaylists: opts.remotePlaylists, remotePlayback: opts.remotePlaylists },
    searchTrackCalls,
    async searchTrack(artist, title) {
      searchTrackCalls.push(`${artist}|${title}`);
      if (opts.searchTrack) return opts.searchTrack(artist, title);
      return { uri: `spotify:track:${artist}-${title}`, title, artist };
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
            return { id: "pl1", uri: "spotify:playlist:pl1", url: "https://open.spotify.com/playlist/pl1", name };
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
    expect(playlist.remotePlaylistUrl).toBe("https://open.spotify.com/playlist/pl1");
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
});
