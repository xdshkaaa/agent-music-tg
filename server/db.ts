import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { runMigrations } from "./migrations";

export type AppDb = Database;

export function openDb(path: string): AppDb {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA foreign_keys = ON;");
  // NORMAL is safe under WAL (only risks the last commit on an OS crash/power
  // loss, not an app crash) and avoids an fsync on every write transaction —
  // meaningfully faster for the frequent small writes on the generation path.
  db.run("PRAGMA synchronous = NORMAL;");
  // Bot (long-polling) and HTTP API hit this db concurrently; without a busy
  // timeout a writer collision throws SQLITE_BUSY immediately instead of
  // waiting briefly for the lock to clear.
  db.run("PRAGMA busy_timeout = 5000;");
  runMigrations(db);
  return db;
}
