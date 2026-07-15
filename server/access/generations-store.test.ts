import { describe, expect, test } from "bun:test";
import { openDb, type AppDb } from "../db";
import {
  appendTracksToGeneration,
  getGeneration,
  insertGeneration,
  listGenerations,
  listSavedGenerations,
  saveGeneration,
  unsaveGeneration,
  type GenerationRow,
} from "./generations-store";
import type { Track } from "../music/types";

function freshDb(): AppDb {
  const db = openDb(":memory:");
  db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [123]);
  return db;
}

const trackA: Track = { uri: "ytm:a", title: "One", artist: "A" };
const trackB: Track = { uri: "ytm:b", title: "Two", artist: "B" };

describe("generations-store tracks_json", () => {
  test("insertGeneration returns id and round-trips tracks_json", () => {
    const db = freshDb();
    const id = insertGeneration(db, 123, "chill", "Chill", 1, [trackA]);
    expect(id).toBeGreaterThan(0);
    const row = getGeneration(db, 123, id);
    expect(row).not.toBeNull();
    expect(row!.tracks).toEqual([trackA]);
    expect(row!.playlistName).toBe("Chill");
  });

  test("getGeneration enforces chat ownership", () => {
    const db = freshDb();
    const id = insertGeneration(db, 123, "p", "P", 1, [trackA]);
    expect(getGeneration(db, 999, id)).toBeNull();
  });

  test("appendTracksToGeneration overwrites with the merged list and updates count", () => {
    const db = freshDb();
    const id = insertGeneration(db, 123, "p", "P", 1, [trackA]);
    appendTracksToGeneration(db, id, [trackA, trackB]);
    const row = getGeneration(db, 123, id);
    expect(row!.tracks).toEqual([trackA, trackB]);
    expect(row!.trackCount).toBe(2);
  });

  test("appendTracksToGeneration updates the name when provided", () => {
    const db = freshDb();
    const id = insertGeneration(db, 123, "p", "P", 1, [trackA]);
    appendTracksToGeneration(db, id, [trackA, trackB], "P Extended");
    const row: GenerationRow = getGeneration(db, 123, id)!;
    expect(row.playlistName).toBe("P Extended");
    expect(row.trackCount).toBe(2);
  });

  test("listGenerations returns stored tracks", () => {
    const db = freshDb();
    insertGeneration(db, 123, "p", "P", 1, [trackA, trackB]);
    const rows = listGenerations(db, 123, 10);
    expect(rows[0]!.tracks).toEqual([trackA, trackB]);
  });

  test("new generation defaults to unsaved", () => {
    const db = freshDb();
    const id = insertGeneration(db, 123, "p", "P", 1, [trackA]);
    const row = getGeneration(db, 123, id);
    expect(row!.saved).toBe(false);
  });
});

describe("generations-store save/unsave/history", () => {
  test("saveGeneration flags own row and it appears in listSavedGenerations", () => {
    const db = freshDb();
    const id = insertGeneration(db, 123, "p", "P", 1, [trackA]);
    expect(saveGeneration(db, 123, id)).toBe(true);
    expect(getGeneration(db, 123, id)!.saved).toBe(true);
    const saved = listSavedGenerations(db, 123);
    expect(saved.map((r) => r.id)).toEqual([id]);
  });

  test("saveGeneration rejects a generation owned by another chat", () => {
    const db = freshDb();
    const id = insertGeneration(db, 123, "p", "P", 1, [trackA]);
    expect(saveGeneration(db, 999, id)).toBe(false);
    expect(getGeneration(db, 123, id)!.saved).toBe(false);
    expect(listSavedGenerations(db, 999)).toEqual([]);
  });

  test("unsaveGeneration removes it from history without deleting the row", () => {
    const db = freshDb();
    const id = insertGeneration(db, 123, "p", "P", 1, [trackA]);
    saveGeneration(db, 123, id);
    expect(unsaveGeneration(db, 123, id)).toBe(true);
    expect(listSavedGenerations(db, 123)).toEqual([]);
    expect(getGeneration(db, 123, id)).not.toBeNull();
  });

  test("listSavedGenerations excludes unsaved rows and other chats", () => {
    const db = freshDb();
    const savedId = insertGeneration(db, 123, "saved", "Saved", 1, [trackA]);
    insertGeneration(db, 123, "unsaved", "Unsaved", 1, [trackB]);
    saveGeneration(db, 123, savedId);
    const rows = listSavedGenerations(db, 123);
    expect(rows.map((r) => r.id)).toEqual([savedId]);
  });
});

describe("legacy DB migration: generations without tracks_json", () => {
  test("openDb adds tracks_json to a pre-existing generations table", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const { Database } = await import("bun:sqlite");

    const dir = mkdtempSync(join(tmpdir(), "gen-migration-"));
    try {
      const path = join(dir, "app.sqlite");
      const legacy = new Database(path);
      legacy.run(`
        CREATE TABLE generations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_id INTEGER NOT NULL,
          prompt TEXT NOT NULL,
          playlist_name TEXT,
          track_count INTEGER,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
      `);
      legacy.run(
        `INSERT INTO generations (chat_id, prompt, playlist_name, track_count) VALUES (123, 'old', 'Old', 2)`,
      );
      legacy.close();

      const db = openDb(path);
      // the production crash: INSERT with tracks_json must not throw
      const id = insertGeneration(db, 123, "new", "New", 1, [trackA]);
      expect(getGeneration(db, 123, id)?.tracks[0]?.uri).toBe("ytm:a");
      // legacy row still readable, tracks default to []
      const legacyRow = listGenerations(db, 123, 10).find((g) => g.prompt === "old");
      expect(legacyRow?.tracks).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
