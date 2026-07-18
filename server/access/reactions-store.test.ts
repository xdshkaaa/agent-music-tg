import { describe, expect, test } from "bun:test";
import { openDb, type AppDb } from "../db";
import { addDislike, isDisliked, listDislikedForPrompt, listDislikedUris, listDislikes, removeDislike } from "./reactions-store";
import { addSavedTrack, listSavedTracks, removeSavedTrack } from "./saved-tracks-store";

function freshDb(): AppDb {
  const db = openDb(":memory:");
  db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [123]);
  return db;
}

describe("reactions-store", () => {
  test("dislike add/remove/list", () => {
    const db = freshDb();
    addDislike(db, 123, { uri: "ytm:a", title: "One", artist: "A" });
    expect(isDisliked(db, 123, "ytm:a")).toBe(true);
    expect(listDislikes(db, 123)).toHaveLength(1);
    expect(removeDislike(db, 123, "ytm:a")).toBe(true);
    expect(isDisliked(db, 123, "ytm:a")).toBe(false);
  });

  test("duplicate dislike add is idempotent", () => {
    const db = freshDb();
    addDislike(db, 123, { uri: "ytm:a", title: "One", artist: "A" });
    addDislike(db, 123, { uri: "ytm:a", title: "One", artist: "A" });
    expect(listDislikes(db, 123)).toHaveLength(1);
  });

  test("mutual exclusivity: dislike removes favorite", () => {
    const db = freshDb();
    addSavedTrack(db, 123, { uri: "ytm:a", title: "One", artist: "A" });
    expect(listSavedTracks(db, 123)).toHaveLength(1);
    // Route-level behavior: disliking removes the favorite first.
    removeSavedTrack(db, 123, "ytm:a");
    addDislike(db, 123, { uri: "ytm:a", title: "One", artist: "A" });
    expect(listSavedTracks(db, 123)).toHaveLength(0);
    expect(isDisliked(db, 123, "ytm:a")).toBe(true);
  });

  test("listDislikedForPrompt caps and formats", () => {
    const db = freshDb();
    for (let i = 0; i < 5; i++) addDislike(db, 123, { uri: `ytm:${i}`, title: `T${i}`, artist: `A${i}` });
    const capped = listDislikedForPrompt(db, 123, 2);
    expect(capped).toHaveLength(2);
    expect(capped[0]).toMatch(/^A\d - T\d$/);
  });

  test("listDislikedUris returns a Set of uris", () => {
    const db = freshDb();
    addDislike(db, 123, { uri: "ytm:a", title: "One", artist: "A" });
    const uris = listDislikedUris(db, 123);
    expect(uris.has("ytm:a")).toBe(true);
    expect(uris.has("ytm:b")).toBe(false);
  });
});
