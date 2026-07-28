import { describe, expect, test } from "bun:test";
import { openDb, type AppDb } from "../db";
import { upsertUser } from "./users-store";
import { publishShare, getShare, revokeShare, listShares, recordShareView } from "./shares-store";

const OWNER = 555001;
const VIEWER = 555002;

function freshDb(): AppDb {
  const db = openDb(":memory:");
  db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [OWNER]);
  upsertUser(db, OWNER);
  return db;
}

const TRACKS = [
  { uri: "ytm:a", title: "One", artist: "A", artwork: "http://x/1.jpg" },
  { uri: "ytm:b", title: "Two", artist: "B" },
];

function publish(db: AppDb, sourceId = 1) {
  return publishShare(db, OWNER, {
    sourceKind: "generation",
    sourceId,
    name: "Вечерний драйв",
    prompt: "что-то тягучее под дождь",
    tracks: TRACKS,
  });
}

describe("shares-store", () => {
  test("publishing the same source twice returns one token", () => {
    const db = freshDb();
    const first = publish(db);
    const second = publish(db);
    expect(second.token).toBe(first.token);
    expect(listShares(db, OWNER)).toHaveLength(1);
  });

  test("publishing a different source mints a different token", () => {
    const db = freshDb();
    expect(publish(db, 1).token).not.toBe(publish(db, 2).token);
  });

  test("reads back the snapshot by token", () => {
    const db = freshDb();
    const share = publish(db);
    const read = getShare(db, share.token)!;
    expect(read.name).toBe("Вечерний драйв");
    expect(read.prompt).toBe("что-то тягучее под дождь");
    expect(read.tracks).toHaveLength(2);
    expect(read.tracks[0]!.uri).toBe("ytm:a");
    expect(read.ownerChatId).toBe(OWNER);
  });

  test("the snapshot survives deletion of the source generation", () => {
    const db = freshDb();
    const share = publish(db);
    db.run("DELETE FROM generations WHERE id = 1");
    expect(getShare(db, share.token)!.tracks).toHaveLength(2);
  });

  test("revoking marks the row and frees the source for a new token", () => {
    const db = freshDb();
    const first = publish(db);
    expect(revokeShare(db, OWNER, first.token)).toBe(true);
    expect(getShare(db, first.token)!.revokedAt).not.toBeNull();
    expect(publish(db).token).not.toBe(first.token);
  });

  test("revoking someone else's share does nothing", () => {
    const db = freshDb();
    const share = publish(db);
    expect(revokeShare(db, VIEWER, share.token)).toBe(false);
    expect(getShare(db, share.token)!.revokedAt).toBeNull();
  });

  test("a viewer is counted once, the owner never", () => {
    const db = freshDb();
    const share = publish(db);
    recordShareView(db, share.token, VIEWER);
    recordShareView(db, share.token, VIEWER);
    recordShareView(db, share.token, OWNER);
    expect(getShare(db, share.token)!.viewCount).toBe(1);
  });

  test("unknown token reads as null", () => {
    expect(getShare(freshDb(), "nope")).toBeNull();
  });
});
