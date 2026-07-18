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
  try { db.run(`ALTER TABLE offers ADD COLUMN rub_amount INTEGER;`); } catch {}
  // Free trial bucket: expiring credits separate from paid `credits`;
  // trial_claimed_at doubles as the once-forever claim marker.
  try { db.run(`ALTER TABLE users ADD COLUMN trial_credits INTEGER NOT NULL DEFAULT 0;`); } catch {}
  try { db.run(`ALTER TABLE users ADD COLUMN trial_until INTEGER;`); } catch {}
  try { db.run(`ALTER TABLE users ADD COLUMN trial_claimed_at INTEGER;`); } catch {}
  // Per-user music provider override; NULL means "use the admin default".
  try { db.run(`ALTER TABLE users ADD COLUMN music_backend TEXT;`); } catch {}

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
      tracks_json TEXT,
      extend_count INTEGER NOT NULL DEFAULT 0,
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

    -- Saved tracks ("Плейлисты" tab): individual tracks a user starred from
    -- search results, independent of the AI-generated playlist history.
    CREATE TABLE IF NOT EXISTS saved_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      uri TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      artwork TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(chat_id, uri)
    );
    CREATE INDEX IF NOT EXISTS idx_saved_tracks_chat ON saved_tracks(chat_id, created_at DESC);
  `);

  // Opt-in playlist history: generation rows keep flowing for extend/resume,
  // but only surface in history once explicitly saved.
  try { db.run(`ALTER TABLE generations ADD COLUMN saved INTEGER NOT NULL DEFAULT 0;`); } catch {}

  // generations.tracks_json: full track list for extend/replay. Added to the
  // CREATE TABLE later, so pre-existing DBs need the column backfilled.
  try { db.run(`ALTER TABLE generations ADD COLUMN tracks_json TEXT;`); } catch {}

  // generations.extend_count: how many times a playlist was extended — the
  // first EXTEND_FREE_LIMIT extends are free, later ones cost a credit.
  try { db.run(`ALTER TABLE generations ADD COLUMN extend_count INTEGER NOT NULL DEFAULT 0;`); } catch {}

  // downloads.updated_at: touched on every status/track write so a stale
  // pending/processing row (crash/restart mid-job) can be detected by age.
  try {
    db.run(`ALTER TABLE downloads ADD COLUMN updated_at INTEGER;`);
  } catch {}
  db.run(`UPDATE downloads SET updated_at = created_at WHERE updated_at IS NULL;`);

  // invoices.reserved_credits: generation credits earmarked (held) when a
  // credits invoice is created, so a canceled payment can roll them back.
  try {
    db.run(`ALTER TABLE invoices ADD COLUMN reserved_credits INTEGER NOT NULL DEFAULT 0;`);
  } catch {}

  db.run(`
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

  // Per-user extra playlist slots purchased with Telegram Stars (free limit is 2).
  try { db.run(`ALTER TABLE users ADD COLUMN extra_playlist_slots INTEGER NOT NULL DEFAULT 0;`); } catch {}

  db.run(`
    -- Player reactions: Dislike only (Like reuses saved_tracks). Excludes the
    -- track from future generations for that user.
    CREATE TABLE IF NOT EXISTS track_reactions (
      chat_id INTEGER NOT NULL,
      uri TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (chat_id, uri)
    );
    CREATE INDEX IF NOT EXISTS idx_track_reactions_chat ON track_reactions(chat_id, created_at DESC);

    -- User-owned playlists ("Музыка" section). Free limit is 2 + extra_playlist_slots.
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_playlists_chat ON playlists(chat_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      uri TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      artwork TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(playlist_id, uri)
    );
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlist_id, position);

    -- LRCLIB lyrics cache, keyed by normalized "artist|title". not_found rows
    -- expire faster (see server/core/lyrics.ts TTL check) so a real result can
    -- replace a miss without waiting out the long TTL.
    CREATE TABLE IF NOT EXISTS lyrics_cache (
      cache_key TEXT PRIMARY KEY,
      synced_json TEXT,
      plain_text TEXT,
      not_found INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Telegram Stars payments, recorded by charge id for idempotent slot grants.
    CREATE TABLE IF NOT EXISTS stars_payments (
      charge_id TEXT PRIMARY KEY,
      chat_id INTEGER NOT NULL,
      slots INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
}
