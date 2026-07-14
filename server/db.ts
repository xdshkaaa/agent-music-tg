import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type AppDb = Database;

export function openDb(path: string): AppDb {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

function migrate(db: AppDb): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS allowlist (
      chat_id INTEGER PRIMARY KEY,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      chat_id INTEGER PRIMARY KEY,
      state TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Payments / entitlements ------------------------------------------

    -- Audience + entitlement record. Every chat that starts the bot or calls
    -- the API is upserted here (drives broadcast + stats + access checks).
    CREATE TABLE IF NOT EXISTS users (
      chat_id INTEGER PRIMARY KEY,
      username TEXT,
      credits INTEGER NOT NULL DEFAULT 0,
      subscription_until INTEGER,
      first_seen INTEGER NOT NULL DEFAULT (unixepoch()),
      last_seen INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Purchasable offers. grant_kind is 'credits' | 'subscription';
    -- grant_amount is credit count or subscription days respectively.
    CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      amount TEXT NOT NULL,
      asset TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      grant_kind TEXT NOT NULL,
      grant_amount INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Payment invoices across providers. provider is 'crypto' | 'stars';
    -- external_id is the Crypto Pay invoice id or the Telegram Stars
    -- telegram_payment_charge_id. amount/asset are frozen at creation time so
    -- fulfillment and revenue stats use the quoted value, not the live offer.
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL DEFAULT 'crypto',
      external_id TEXT NOT NULL,
      chat_id INTEGER NOT NULL,
      offer_id INTEGER NOT NULL,
      amount TEXT NOT NULL,
      asset TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      paid_at INTEGER,
      UNIQUE(provider, external_id)
    );
  `);

  try { db.run(`ALTER TABLE users ADD COLUMN photo_file_id TEXT;`); } catch {}
  try { db.run(`ALTER TABLE users ADD COLUMN active_model TEXT;`); } catch {}
  try { db.run(`ALTER TABLE offers ADD COLUMN stars_amount INTEGER;`); } catch {}
  try { db.run(`ALTER TABLE offers ADD COLUMN icon TEXT;`); } catch {}
  // Free trial bucket: expiring credits separate from paid `credits`;
  // trial_claimed_at doubles as the once-forever claim marker.
  try { db.run(`ALTER TABLE users ADD COLUMN trial_credits INTEGER NOT NULL DEFAULT 0;`); } catch {}
  try { db.run(`ALTER TABLE users ADD COLUMN trial_until INTEGER;`); } catch {}
  try { db.run(`ALTER TABLE users ADD COLUMN trial_claimed_at INTEGER;`); } catch {}

  // Legacy invoices (crypto-only shape keyed by invoice_id) -> provider/external_id.
  const legacyInvoices = db
    .query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM pragma_table_info('invoices') WHERE name = 'invoice_id'`)
    .get();
  if ((legacyInvoices?.n ?? 0) > 0) {
    db.transaction(() => {
      db.run(`
        CREATE TABLE invoices_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider TEXT NOT NULL DEFAULT 'crypto',
          external_id TEXT NOT NULL,
          chat_id INTEGER NOT NULL,
          offer_id INTEGER NOT NULL,
          amount TEXT NOT NULL,
          asset TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          paid_at INTEGER,
          UNIQUE(provider, external_id)
        );
      `);
      db.run(`
        INSERT INTO invoices_new (provider, external_id, chat_id, offer_id, amount, asset, status, created_at, paid_at)
        SELECT 'crypto', CAST(invoice_id AS TEXT), chat_id, offer_id, amount, asset, status, created_at, paid_at
        FROM invoices ORDER BY invoice_id;
      `);
      db.run(`DROP TABLE invoices;`);
      db.run(`ALTER TABLE invoices_new RENAME TO invoices;`);
    })();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      prompt TEXT NOT NULL,
      playlist_name TEXT,
      track_count INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Audio downloads -----------------------------------------------------

    -- One row per playlist download job. tracks_json is the full track list
    -- with per-track delivery status (read/written as a unit, like
    -- sessions.state). status: pending | processing | done | partial | failed.
    CREATE TABLE IF NOT EXISTS downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      playlist_name TEXT NOT NULL,
      tracks_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_downloads_chat ON downloads(chat_id, created_at DESC);

    -- Telegram file_id cache: audio uploaded once, re-sent by file_id after.
    -- Keyed by track uri (ytm:<id> / sc:<id>); shared across users.
    CREATE TABLE IF NOT EXISTS audio_cache (
      uri TEXT PRIMARY KEY,
      tg_file_id TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      duration_ms INTEGER,
      size_bytes INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Channel subscription gate -----------------------------------------

    CREATE TABLE IF NOT EXISTS required_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL UNIQUE,
      username TEXT,
      invite_link TEXT,
      title TEXT NOT NULL,
      added_by INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS channel_memberships (
      chat_id INTEGER NOT NULL,
      channel_id INTEGER NOT NULL,
      is_member INTEGER NOT NULL DEFAULT 0,
      checked_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (chat_id, channel_id)
    );

    -- Admin grant history -------------------------------------------------

    CREATE TABLE IF NOT EXISTS grant_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('credits','subscription','subscription_revoked')),
      amount INTEGER NOT NULL,
      granted_by INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_grant_history_chat_id ON grant_history(chat_id);
  `);
}
