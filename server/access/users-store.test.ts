import { describe, expect, test } from "bun:test";
import { openDb } from "../db";
import { getUser, upsertUser } from "./users-store";

const CHAT = 4242;

function freshDb() {
  return openDb(":memory:");
}

function lastSeen(db: ReturnType<typeof freshDb>): number {
  const row = db.query<{ last_seen: number }, [number]>(
    `SELECT last_seen FROM users WHERE chat_id = ?`,
  ).get(CHAT);
  return row!.last_seen;
}

describe("upsertUser last_seen throttling", () => {
  test("reports a brand-new chat exactly once", () => {
    const db = freshDb();
    expect(upsertUser(db, CHAT, "alice", "Алиса")).toBe(true);
    expect(upsertUser(db, CHAT, "alice", "Алиса")).toBe(false);
  });

  test("skips repeat writes for the same identity, even with a username present", () => {
    // Regression guard: the throttle used to apply only when username was null,
    // so every authenticated request from a user with a @username — including
    // each Range request of a playing track — paid a SELECT plus a WAL commit.
    const db = freshDb();
    upsertUser(db, CHAT, "alice", "Алиса");
    db.query(`UPDATE users SET last_seen = 0 WHERE chat_id = ?`).run(CHAT);
    upsertUser(db, CHAT, "alice", "Алиса");
    expect(lastSeen(db)).toBe(0); // untouched — the call never reached the DB
  });

  test("writes through immediately when the Telegram identity changes", () => {
    const db = freshDb();
    upsertUser(db, CHAT, "alice", "Алиса");
    upsertUser(db, CHAT, "alice_new", "Алиса");
    expect(getUser(db, CHAT)?.username).toBe("alice_new");
    upsertUser(db, CHAT, "alice_new", "Алиса Б.");
    expect(getUser(db, CHAT)?.firstName).toBe("Алиса Б.");
  });

  test("keeps throttle state separate per database", () => {
    const a = freshDb();
    const b = freshDb();
    expect(upsertUser(a, CHAT, "alice", "Алиса")).toBe(true);
    expect(upsertUser(b, CHAT, "alice", "Алиса")).toBe(true);
  });
});
