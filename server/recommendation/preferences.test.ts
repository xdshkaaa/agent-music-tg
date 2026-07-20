import { describe, expect, test } from "bun:test";
import { openDb } from "../db";
import { recordMusicFeedback } from "../access/music-feedback-store";
import { buildPreferenceSnapshot } from "./preferences";
import { createTrackRanker } from "./ranker";
import { resolveGenreContext } from "./genre-knowledge";

describe("recommendation preferences", () => {
  test("combines saves, playlists, playback, and explicit dislikes into one snapshot", () => {
    const db = openDb(":memory:");
    const chatId = 42;
    db.run("INSERT INTO saved_tracks (chat_id, uri, title, artist) VALUES (?, ?, ?, ?)", [chatId, "ytm:a", "One", "Liked Artist"]);
    db.run("INSERT INTO playlists (chat_id, name) VALUES (?, ?)", [chatId, "Mine"]);
    const playlistId = Number(db.query<{ id: number }, []>("SELECT id FROM playlists").get()!.id);
    db.run("INSERT INTO playlist_tracks (playlist_id, uri, title, artist) VALUES (?, ?, ?, ?)", [playlistId, "ytm:b", "Two", "Playlist Artist"]);
    db.run("INSERT INTO track_reactions (chat_id, uri, title, artist) VALUES (?, ?, ?, ?)", [chatId, "ytm:c", "Three", "Rejected Artist"]);
    recordMusicFeedback(db, chatId, "play_completed", { uri: "ytm:d", title: "Four", artist: "Completed Artist" });

    const snapshot = buildPreferenceSnapshot(db, chatId);
    expect(snapshot.artistWeights.get("liked artist")).toBeGreaterThan(0);
    expect(snapshot.artistWeights.get("playlist artist")).toBeGreaterThan(0);
    expect(snapshot.artistWeights.get("completed artist")).toBeGreaterThan(0);
    expect(snapshot.artistWeights.get("rejected artist")).toBeLessThan(0);
    expect(snapshot.dislikedUris.has("ytm:c")).toBe(true);
  });

  test("stable ranker boosts preferences and genre anchors without extra candidates", () => {
    const context = resolveGenreContext("dreamy shoegaze");
    const preferences = {
      artistWeights: new Map([["favorite", 5]]),
      dislikedUris: new Set<string>(),
      dislikedTracks: [],
    };
    const tracks = [
      { uri: "ytm:1", title: "Neutral", artist: "Other" },
      { uri: "ytm:2", title: "Favorite Song", artist: "Favorite" },
      { uri: "ytm:3", title: "When the Sun Hits", artist: "Slowdive" },
    ];

    const ranked = createTrackRanker(context, preferences)(tracks);
    expect(ranked).toHaveLength(tracks.length);
    expect(new Set(ranked.map((track) => track.uri))).toEqual(new Set(tracks.map((track) => track.uri)));
    expect(ranked[0]!.artist).toBe("Favorite");
    expect(ranked[1]!.artist).toBe("Slowdive");
  });

  test("preserves backend order when no ranking signals exist", () => {
    const tracks = [
      { uri: "ytm:1", title: "One", artist: "A" },
      { uri: "ytm:2", title: "Two", artist: "B" },
    ];
    const ranked = createTrackRanker(null, {
      artistWeights: new Map(),
      dislikedUris: new Set(),
      dislikedTracks: [],
    })(tracks);
    expect(ranked).toEqual(tracks);
  });

  test("removes explicitly disliked URIs before the agent sees candidates", () => {
    const tracks = [
      { uri: "ytm:1", title: "One", artist: "A" },
      { uri: "ytm:2", title: "Two", artist: "B" },
    ];
    const ranked = createTrackRanker(null, {
      artistWeights: new Map(),
      dislikedUris: new Set(["ytm:1"]),
      dislikedTracks: ["A - One"],
    })(tracks);
    expect(ranked.map((track) => track.uri)).toEqual(["ytm:2"]);
  });
});
