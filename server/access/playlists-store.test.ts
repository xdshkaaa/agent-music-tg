import { describe, expect, test } from "bun:test";
import { openDb, type AppDb } from "../db";
import { upsertUser } from "./users-store";
import {
  FREE_PLAYLIST_LIMIT,
  PlaylistLimitError,
  addExtraSlots,
  addTrackToPlaylist,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  getPlaylistLimit,
  listPlaylists,
  removeTrackFromPlaylist,
  renamePlaylist,
} from "./playlists-store";

function freshDb(): AppDb {
  const db = openDb(":memory:");
  db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [123]);
  upsertUser(db, 123);
  return db;
}

describe("playlists-store", () => {
  test("create, list, rename, delete", () => {
    const db = freshDb();
    const p = createPlaylist(db, 123, "Chill");
    expect(p.trackCount).toBe(0);
    expect(listPlaylists(db, 123)).toHaveLength(1);
    expect(renamePlaylist(db, 123, p.id, "Focus")).toBe(true);
    expect(getPlaylist(db, 123, p.id)?.name).toBe("Focus");
    expect(deletePlaylist(db, 123, p.id)).toBe(true);
    expect(listPlaylists(db, 123)).toHaveLength(0);
  });

  test("limit math: 2 free, +extra slots", () => {
    const db = freshDb();
    expect(getPlaylistLimit(db, 123)).toBe(FREE_PLAYLIST_LIMIT);
    createPlaylist(db, 123, "A");
    createPlaylist(db, 123, "B");
    expect(() => createPlaylist(db, 123, "C")).toThrow(PlaylistLimitError);
    addExtraSlots(db, 123, 1);
    expect(getPlaylistLimit(db, 123)).toBe(FREE_PLAYLIST_LIMIT + 1);
    expect(createPlaylist(db, 123, "C").name).toBe("C");
    expect(() => createPlaylist(db, 123, "D")).toThrow(PlaylistLimitError);
  });

  test("duplicate track add is idempotent", () => {
    const db = freshDb();
    const p = createPlaylist(db, 123, "Chill");
    const track = { uri: "ytm:a", title: "One", artist: "A" };
    expect(addTrackToPlaylist(db, 123, p.id, track)).toBe("added");
    expect(addTrackToPlaylist(db, 123, p.id, track)).toBe("duplicate");
    expect(getPlaylist(db, 123, p.id)?.tracks).toHaveLength(1);
    expect(removeTrackFromPlaylist(db, 123, p.id, "ytm:a")).toBe(true);
    expect(getPlaylist(db, 123, p.id)?.tracks).toHaveLength(0);
  });

  test("add track to a playlist not owned by chat returns not_found", () => {
    const db = freshDb();
    const p = createPlaylist(db, 123, "Chill");
    expect(addTrackToPlaylist(db, 999, p.id, { uri: "ytm:a", title: "One", artist: "A" })).toBe("not_found");
  });
});
