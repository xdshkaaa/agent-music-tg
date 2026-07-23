import type { AppDb } from "./db";

interface Migration {
  version: number;
  run(db: AppDb): void;
}

/**
 * Ordered, versioned migrations tracked via `PRAGMA user_version`. Each entry
 * is numbered in the order it was historically applied (previously as an
 * unconditional CREATE TABLE IF NOT EXISTS / ALTER-in-a-try/catch on every
 * startup); numbering them lets a fresh DB jump straight to the latest schema
 * and an existing DB skip everything it already has, instead of re-attempting
 * every ALTER on every boot. New migrations: append with the next version
 * number, write it so a partial/interrupted run of it is safe to retry.
 */
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    run(db) {
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
          first_name TEXT,
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
    },
  },
  {
    version: 2,
    run(db) {
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
    },
  },
  {
    version: 3,
    run(db) {
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
    },
  },
  {
    version: 4,
    run(db) {
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
    },
  },
  {
    version: 5,
    run(db) {
      // Opt-in playlist history: generation rows keep flowing for extend/resume,
      // but only surface in history once explicitly saved.
      try { db.run(`ALTER TABLE generations ADD COLUMN saved INTEGER NOT NULL DEFAULT 0;`); } catch {}
      // generations.tracks_json: full track list for extend/replay. Added to the
      // CREATE TABLE later, so pre-existing DBs need the column backfilled.
      try { db.run(`ALTER TABLE generations ADD COLUMN tracks_json TEXT;`); } catch {}
      // generations.extend_count: how many times a playlist was extended — the
      // first EXTEND_FREE_LIMIT extends are free, later ones cost a credit.
      try { db.run(`ALTER TABLE generations ADD COLUMN extend_count INTEGER NOT NULL DEFAULT 0;`); } catch {}
    },
  },
  {
    version: 6,
    run(db) {
      // downloads.updated_at: touched on every status/track write so a stale
      // pending/processing row (crash/restart mid-job) can be detected by age.
      try { db.run(`ALTER TABLE downloads ADD COLUMN updated_at INTEGER;`); } catch {}
      db.run(`UPDATE downloads SET updated_at = created_at WHERE updated_at IS NULL;`);
    },
  },
  {
    version: 7,
    run(db) {
      // invoices.reserved_credits: generation credits earmarked (held) when a
      // credits invoice is created, so a canceled payment can roll them back.
      try { db.run(`ALTER TABLE invoices ADD COLUMN reserved_credits INTEGER NOT NULL DEFAULT 0;`); } catch {}
    },
  },
  {
    version: 8,
    run(db) {
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
    },
  },
  {
    version: 9,
    run(db) {
      // Per-user extra playlist slots purchased with Telegram Stars (free limit is 2).
      try { db.run(`ALTER TABLE users ADD COLUMN extra_playlist_slots INTEGER NOT NULL DEFAULT 0;`); } catch {}
    },
  },
  {
    version: 10,
    run(db) {
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
    },
  },
  {
    version: 11,
    run(db) {
      try { db.run(`ALTER TABLE users ADD COLUMN referred_by INTEGER;`); } catch {}
      db.run(`
        -- One row per invitee: dedupes double-credit and caps referrer counts.
        CREATE TABLE IF NOT EXISTS referral_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          referrer_chat_id INTEGER NOT NULL,
          referred_chat_id INTEGER NOT NULL UNIQUE,
          credits_granted INTEGER NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_referral_events_referrer ON referral_events(referrer_chat_id);
      `);
    },
  },
  {
    version: 12,
    run(db) {
      db.run(`
        -- First-touch acquisition data. One immutable row per user keeps
        -- later untagged launches from overwriting the campaign that acquired
        -- them. start_param preserves the original Telegram deep-link payload.
        CREATE TABLE IF NOT EXISTS user_attribution (
          chat_id INTEGER PRIMARY KEY,
          source TEXT NOT NULL,
          medium TEXT,
          campaign TEXT,
          content TEXT,
          term TEXT,
          start_param TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_user_attribution_source
          ON user_attribution(source, medium, campaign);

        -- Append-only product event stream used for unique-user funnels.
        -- event_key is optional; when present it makes retry-prone server
        -- events idempotent without suppressing legitimate repeated actions.
        CREATE TABLE IF NOT EXISTS analytics_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_id INTEGER NOT NULL,
          event_name TEXT NOT NULL,
          properties_json TEXT NOT NULL DEFAULT '{}',
          event_key TEXT UNIQUE,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_analytics_events_name_time
          ON analytics_events(event_name, created_at);
        CREATE INDEX IF NOT EXISTS idx_analytics_events_chat_time
          ON analytics_events(chat_id, created_at);

        -- Existing users predate attribution, so label them honestly instead
        -- of pretending they were direct traffic. New users are attributed at
        -- their first /start or authenticated Mini App launch.
        INSERT OR IGNORE INTO user_attribution (chat_id, source, medium, created_at)
        SELECT chat_id, 'unknown', 'legacy', first_seen FROM users;

        -- Seed the historical parts of the funnel that can be reconstructed
        -- exactly from domain tables. Open/start views cannot be backfilled.
        INSERT OR IGNORE INTO analytics_events (chat_id, event_name, event_key, created_at)
        SELECT chat_id, 'generation_completed', 'generation:' || id, created_at FROM generations;
        INSERT OR IGNORE INTO analytics_events (chat_id, event_name, event_key, created_at)
        SELECT chat_id, 'checkout_started', 'invoice:' || id, created_at FROM invoices;
        INSERT OR IGNORE INTO analytics_events (chat_id, event_name, event_key, created_at)
        SELECT chat_id, 'purchase_completed', 'purchase:' || id, paid_at
        FROM invoices WHERE status = 'paid' AND paid_at IS NOT NULL;
      `);
    },
  },
  {
    version: 13,
    run(db) {
      // Stored from trusted Telegram updates/initData for personalized broadcasts.
      try { db.run(`ALTER TABLE users ADD COLUMN first_name TEXT;`); } catch {}
    },
  },
  {
    version: 14,
    run(db) {
      db.run(`
        -- Campaign touches are separate from immutable first-touch attribution:
        -- returning users must still appear in UTM campaign reports.
        CREATE TABLE IF NOT EXISTS attribution_touches (
          chat_id INTEGER NOT NULL,
          source TEXT NOT NULL,
          medium TEXT,
          campaign TEXT,
          content TEXT,
          term TEXT,
          start_param TEXT NOT NULL,
          first_seen INTEGER NOT NULL DEFAULT (unixepoch()),
          last_seen INTEGER NOT NULL DEFAULT (unixepoch()),
          touch_count INTEGER NOT NULL DEFAULT 1,
          PRIMARY KEY (chat_id, start_param)
        );
        CREATE INDEX IF NOT EXISTS idx_attribution_touches_campaign_time
          ON attribution_touches(source, medium, campaign, last_seen);
      `);
    },
  },
  {
    version: 15,
    run(db) {
      db.run(`
        -- Coarse, aggregate playback signals for recommendation ranking. One
        -- row per user+track keeps retries and long-term storage bounded.
        CREATE TABLE IF NOT EXISTS music_feedback (
          chat_id INTEGER NOT NULL,
          uri TEXT NOT NULL,
          title TEXT NOT NULL,
          artist TEXT NOT NULL,
          play_started_count INTEGER NOT NULL DEFAULT 0,
          play_completed_count INTEGER NOT NULL DEFAULT 0,
          skipped_count INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          PRIMARY KEY (chat_id, uri)
        );
        CREATE INDEX IF NOT EXISTS idx_music_feedback_chat_updated
          ON music_feedback(chat_id, updated_at DESC);
      `);
    },
  },
  {
    // generations has no index on chat_id despite every read query
    // (history list, rate-limit counts, saved-playlists list, profile stats)
    // filtering by it — was a full table scan on this ever-growing table.
    version: 16,
    run(db) {
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_generations_chat_created
          ON generations(chat_id, created_at DESC);
      `);
    },
  },
  {
    // invoices is queried by chat_id (profile purchase history) and by
    // status+provider (payment poller fallback) with no supporting index —
    // both were full table scans.
    version: 17,
    run(db) {
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_invoices_chat ON invoices(chat_id, id DESC);
        CREATE INDEX IF NOT EXISTS idx_invoices_status_provider ON invoices(status, provider);
      `);
    },
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

/**
 * Applies every migration newer than the DB's current `user_version`, in
 * order, then stamps the new version. A brand-new DB starts at version 0 and
 * runs the full list; an existing DB from before versioning was introduced
 * also starts at 0 (PRAGMA user_version defaults to 0), so it replays every
 * migration once — safe, since each one is idempotent (IF NOT EXISTS /
 * ADD COLUMN wrapped in try/catch) — and is left correctly stamped at the
 * latest version, so every future boot after that skips straight past it.
 */
export function runMigrations(db: AppDb): void {
  const row = db.query<{ user_version: number }, []>(`PRAGMA user_version`).get();
  const currentVersion = row?.user_version ?? 0;
  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) continue;
    migration.run(db);
    db.run(`PRAGMA user_version = ${migration.version}`);
  }
}
