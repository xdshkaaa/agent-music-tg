import { describe, expect, test } from "bun:test";
import { openDb, type AppDb } from "../db";
import { upsertUser } from "./users-store";
import { getExtraSlots } from "./playlists-store";
import { grantPlaylistSlotsForPayment } from "./stars-payments-store";

function freshDb(): AppDb {
  const db = openDb(":memory:");
  db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [123]);
  upsertUser(db, 123);
  return db;
}

describe("grantPlaylistSlotsForPayment", () => {
  test("grants slots once per charge id", () => {
    const db = freshDb();
    expect(grantPlaylistSlotsForPayment(db, "charge-1", 123, 2)).toBe(true);
    expect(getExtraSlots(db, 123)).toBe(2);
    expect(grantPlaylistSlotsForPayment(db, "charge-1", 123, 2)).toBe(false);
    expect(getExtraSlots(db, 123)).toBe(2);
  });

  test("distinct charge ids grant independently", () => {
    const db = freshDb();
    grantPlaylistSlotsForPayment(db, "charge-1", 123, 1);
    grantPlaylistSlotsForPayment(db, "charge-2", 123, 3);
    expect(getExtraSlots(db, 123)).toBe(4);
  });
});
