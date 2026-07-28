# Playlist Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user publish a generation or saved playlist as a Telegram link that anyone can open, play, and save — admitting new users through it, attributing them to the `share` channel, and crediting the author via the existing referral economy.

**Architecture:** A new `playlist_shares` table stores an immutable snapshot of the tracklist keyed by a random token. Publishing is idempotent per source. Reading a share is the only API route exempt from the allowlist check, so a newcomer can see the playlist before becoming a user. Link intake reuses `parseStartAttribution` and `applyReferral` — no second reward system. The Mini App gets one new screen; sharing into a chat uses `t.me/share/url` with an optional richer path.

**Tech Stack:** Bun, Hono, `bun:sqlite`, grammY, React (Mini App), `bun test`.

## Global Constraints

- All user-facing text is in **Russian**.
- Snapshot semantics: `tracks_json` is copied at publish time and never follows the source afterwards.
- Publishing the same source twice returns the existing token; it never mints a second one.
- Revocation sets `revoked_at`; rows are never deleted, so a revoked link answers 410 and a never-existing one answers 404.
- Only `GET /api/shares/:token` is exempt from the allowlist check. Publishing, listing, and revoking stay behind the normal `requireAuth`.
- The author is credited through `applyReferral` only — no new counters, rates, or caps.
- Migration version for this feature is **20** (latest existing is 19, `server/migrations.ts:499`).
- Tests run with `bun test`; type check with `bun run typecheck`.

## Deviations from the spec

Two things changed once the code was read. Both are deliberate and are the version this plan builds:

1. **Link format.** The spec assumed `https://t.me/<bot>/<app>?startapp=pl_<token>`. That form needs a Mini App short name registered in BotFather, but the bot opens the app through `web_app` buttons carrying a URL (`server/bot/index.ts:48`, `:296`), so no short name is guaranteed to exist. The link builder therefore emits `https://t.me/<bot>?start=pl_<token>` by default and uses the `startapp` form only when the new optional `TELEGRAM_MINIAPP_NAME` env var is set. Both routes credit the author; the `/start` route is the one that always works.

2. **Card image.** The spec called for a server-rendered 2×2 collage. Rendering images server-side means a native image dependency (sharp/canvas) installed on the VPS, which is disproportionate for a share card. The **Mini App screen** still shows a real 2×2 collage — it is pure CSS over four artwork URLs. The **chat card** uses the first track's artwork, which is already a public CDN URL Telegram can fetch. A server-rendered collage stays available as a later change if the card proves worth it.

## File structure

**Create:**
- `server/access/shares-store.ts` — token generation, publish/read/revoke/list, view counting.
- `server/access/shares-store.test.ts`
- `server/api/share-routes.ts` — the four HTTP routes.
- `server/api/shares.test.ts`
- `miniapp/src/screens/SharedPlaylistScreen.tsx` — recipient view.
- `miniapp/src/lib/share.ts` — client-side share invocation + fallback.
- `miniapp/src/lib/share.test.ts`

**Modify:**
- `server/migrations.ts` — append migration 20.
- `server/analytics/store.ts:43` — `pl_` branch in `parseStartAttribution`.
- `server/api/middleware.ts` — `requireAuthAllowUnlisted`.
- `server/api/routes.ts` — mount share routes, credit author on `pl_` start param.
- `server/bot/index.ts` — handle `/start pl_<token>`.
- `server/env.ts` — optional `TELEGRAM_MINIAPP_NAME`.
- `.env.example` — document it.
- `miniapp/src/lib/api.ts` — share client methods.
- `miniapp/src/App.tsx` — `?share=<token>` route to the new screen.
- `miniapp/src/screens/ResultsScreen.tsx` — «Поделиться» action.
- `miniapp/src/screens/PlaylistsScreen.tsx` — «Поделиться» action.
- `README.md` — document the feature.

---

### Task 1: Shares store and migration

**Files:**
- Modify: `server/migrations.ts:512` (append after the version-19 entry)
- Create: `server/access/shares-store.ts`
- Test: `server/access/shares-store.test.ts`

**Interfaces:**
- Consumes: `AppDb` from `../db`, `Track` from `../music/types`.
- Produces:
  - `interface ShareSnapshot { token: string; ownerChatId: number; sourceKind: "generation" | "playlist"; sourceId: number; name: string; prompt: string | null; tracks: Track[]; viewCount: number; revokedAt: number | null; createdAt: number }`
  - `publishShare(db, ownerChatId, input: { sourceKind: "generation" | "playlist"; sourceId: number; name: string; prompt: string | null; tracks: Track[] }): ShareSnapshot`
  - `getShare(db, token: string): ShareSnapshot | null`
  - `revokeShare(db, ownerChatId: number, token: string): boolean`
  - `listShares(db, ownerChatId: number): ShareSnapshot[]`
  - `recordShareView(db, token: string, viewerChatId: number): void`

- [ ] **Step 1: Write the failing test**

Create `server/access/shares-store.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test server/access/shares-store.test.ts`
Expected: FAIL — the module `./shares-store` does not exist.

- [ ] **Step 3: Add migration 20**

In `server/migrations.ts`, append a new entry to the `MIGRATIONS` array immediately after the version-19 object (which closes at line 512, just before the array's `];`):

```typescript
  {
    // Playlist sharing. tracks_json is a snapshot taken at publish time, not a
    // reference: editing or deleting the source must never change or break a
    // link that is already circulating. The partial unique index makes
    // publishing idempotent per source — users tap "share" repeatedly, and
    // that must not produce a pile of live tokens for the same playlist.
    // Revocation sets revoked_at rather than deleting, so a taken-down link
    // can answer 410 instead of being indistinguishable from a typo.
    version: 20,
    run(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS playlist_shares (
          token TEXT PRIMARY KEY,
          owner_chat_id INTEGER NOT NULL,
          source_kind TEXT NOT NULL,
          source_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          prompt TEXT,
          tracks_json TEXT NOT NULL,
          view_count INTEGER NOT NULL DEFAULT 0,
          revoked_at INTEGER,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_playlist_shares_owner
          ON playlist_shares(owner_chat_id, created_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_playlist_shares_source
          ON playlist_shares(owner_chat_id, source_kind, source_id)
          WHERE revoked_at IS NULL;

        CREATE TABLE IF NOT EXISTS playlist_share_views (
          token TEXT NOT NULL REFERENCES playlist_shares(token) ON DELETE CASCADE,
          viewer_chat_id INTEGER NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          PRIMARY KEY (token, viewer_chat_id)
        );
      `);
    },
  },
```

- [ ] **Step 4: Write the store**

Create `server/access/shares-store.ts`:

```typescript
import type { AppDb } from "../db";
import type { Track } from "../music/types";

export type ShareSourceKind = "generation" | "playlist";

export interface ShareSnapshot {
  token: string;
  ownerChatId: number;
  sourceKind: ShareSourceKind;
  sourceId: number;
  name: string;
  prompt: string | null;
  tracks: Track[];
  viewCount: number;
  revokedAt: number | null;
  createdAt: number;
}

export interface ShareInput {
  sourceKind: ShareSourceKind;
  sourceId: number;
  name: string;
  prompt: string | null;
  tracks: Track[];
}

interface ShareRow {
  token: string;
  owner_chat_id: number;
  source_kind: string;
  source_id: number;
  name: string;
  prompt: string | null;
  tracks_json: string;
  view_count: number;
  revoked_at: number | null;
  created_at: number;
}

const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const TOKEN_LENGTH = 10;

/**
 * Unguessable token — the share URL is the only thing protecting a snapshot,
 * so it comes from the CSPRNG, not Math.random. Rejection sampling keeps the
 * alphabet uniform (256 % 62 != 0, so raw modulo would bias the first chars).
 */
export function generateShareToken(): string {
  const out: string[] = [];
  const limit = 256 - (256 % TOKEN_ALPHABET.length);
  while (out.length < TOKEN_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH));
    for (const byte of bytes) {
      if (byte >= limit) continue;
      out.push(TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length]!);
      if (out.length === TOKEN_LENGTH) break;
    }
  }
  return out.join("");
}

function parseTracks(json: string): Track[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as Track[]) : [];
  } catch {
    return [];
  }
}

function toSnapshot(row: ShareRow): ShareSnapshot {
  return {
    token: row.token,
    ownerChatId: row.owner_chat_id,
    sourceKind: row.source_kind as ShareSourceKind,
    sourceId: row.source_id,
    name: row.name,
    prompt: row.prompt,
    tracks: parseTracks(row.tracks_json),
    viewCount: row.view_count,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

/**
 * Idempotent per (owner, source): a live share for the same source is returned
 * as-is rather than replaced, so a link already sent into a chat keeps working
 * and keeps its view count.
 */
export function publishShare(db: AppDb, ownerChatId: number, input: ShareInput): ShareSnapshot {
  const existing = db
    .query<ShareRow, [number, string, number]>(
      `SELECT * FROM playlist_shares
       WHERE owner_chat_id = ? AND source_kind = ? AND source_id = ? AND revoked_at IS NULL`,
    )
    .get(ownerChatId, input.sourceKind, input.sourceId);
  if (existing) return toSnapshot(existing);

  const token = generateShareToken();
  db.query(
    `INSERT INTO playlist_shares (token, owner_chat_id, source_kind, source_id, name, prompt, tracks_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(token, ownerChatId, input.sourceKind, input.sourceId, input.name, input.prompt, JSON.stringify(input.tracks));
  return getShare(db, token)!;
}

export function getShare(db: AppDb, token: string): ShareSnapshot | null {
  const row = db.query<ShareRow, [string]>(`SELECT * FROM playlist_shares WHERE token = ?`).get(token);
  return row ? toSnapshot(row) : null;
}

export function revokeShare(db: AppDb, ownerChatId: number, token: string): boolean {
  const info = db
    .query(`UPDATE playlist_shares SET revoked_at = unixepoch() WHERE token = ? AND owner_chat_id = ? AND revoked_at IS NULL`)
    .run(token, ownerChatId);
  return info.changes > 0;
}

export function listShares(db: AppDb, ownerChatId: number): ShareSnapshot[] {
  return db
    .query<ShareRow, [number]>(
      `SELECT * FROM playlist_shares WHERE owner_chat_id = ? AND revoked_at IS NULL ORDER BY created_at DESC`,
    )
    .all(ownerChatId)
    .map(toSnapshot);
}

/**
 * One row per (token, viewer) so reopening a link never inflates the counter,
 * and the owner previewing their own share is not a view at all.
 */
export function recordShareView(db: AppDb, token: string, viewerChatId: number): void {
  const share = getShare(db, token);
  if (!share || share.ownerChatId === viewerChatId) return;
  const info = db
    .query(`INSERT INTO playlist_share_views (token, viewer_chat_id) VALUES (?, ?) ON CONFLICT DO NOTHING`)
    .run(token, viewerChatId);
  if (info.changes > 0) {
    db.query(`UPDATE playlist_shares SET view_count = view_count + 1 WHERE token = ?`).run(token);
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test server/access/shares-store.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add server/migrations.ts server/access/shares-store.ts server/access/shares-store.test.ts
git commit -m "feat(shares): add playlist share snapshots store"
```

---

### Task 2: Share link builder

**Files:**
- Modify: `server/env.ts:36` (add `miniappName` next to `publicOrigin`)
- Modify: `.env.example:10`
- Create: `server/access/share-link.ts`
- Test: `server/access/share-link.test.ts`

**Interfaces:**
- Consumes: `generateShareToken` is not needed here; only `env`.
- Produces: `buildShareUrl(botUsername: string, token: string): string`, `SHARE_START_PREFIX = "pl_"`, `parseShareToken(startParam: string | null | undefined): string | null`.

- [ ] **Step 1: Write the failing test**

Create `server/access/share-link.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";

const { buildShareUrl, parseShareToken } = await import("./share-link");

describe("share-link", () => {
  test("builds a bot deep link when no mini app name is configured", () => {
    expect(buildShareUrl("music_agentbot", "abc123XYZ0")).toBe(
      "https://t.me/music_agentbot?start=pl_abc123XYZ0",
    );
  });

  test("parses its own start payload", () => {
    expect(parseShareToken("pl_abc123XYZ0")).toBe("abc123XYZ0");
  });

  test("ignores unrelated start payloads", () => {
    expect(parseShareToken("ref_12345")).toBeNull();
    expect(parseShareToken("utm_vk__cpc__x")).toBeNull();
    expect(parseShareToken(null)).toBeNull();
    expect(parseShareToken("pl_not!valid")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test server/access/share-link.test.ts`
Expected: FAIL — module `./share-link` not found.

- [ ] **Step 3: Add the env var**

In `server/env.ts`, next to the `publicOrigin` line, add:

```typescript
  /**
   * Mini App short name from BotFather, when one is registered. With it a
   * share link can open the app directly (?startapp=); without it the link
   * goes through the bot (?start=), which always works.
   */
  miniappName: (process.env.TELEGRAM_MINIAPP_NAME ?? "").trim() || null,
```

In `.env.example`, under `PUBLIC_ORIGIN`:

```
# Optional: Mini App short name from BotFather. When set, share links open the
# Mini App directly (t.me/<bot>/<name>?startapp=...); otherwise they go through
# the bot (t.me/<bot>?start=...).
TELEGRAM_MINIAPP_NAME=
```

- [ ] **Step 4: Write the link builder**

Create `server/access/share-link.ts`:

```typescript
import { env } from "../env";

export const SHARE_START_PREFIX = "pl_";

/**
 * The `startapp` form needs a Mini App short name registered in BotFather; the
 * bot opens the app through web_app buttons carrying a URL, so no short name is
 * guaranteed to exist. The `start` form always works and lands the recipient in
 * the bot, which is also where a newcomer gets attributed and the author
 * credited — so it is the default, not a degraded fallback.
 */
export function buildShareUrl(botUsername: string, token: string): string {
  if (env.miniappName) {
    return `https://t.me/${botUsername}/${env.miniappName}?startapp=${SHARE_START_PREFIX}${token}`;
  }
  return `https://t.me/${botUsername}?start=${SHARE_START_PREFIX}${token}`;
}

export function parseShareToken(startParam: string | null | undefined): string | null {
  const match = /^pl_([A-Za-z0-9]{10})$/.exec((startParam ?? "").trim());
  return match ? match[1]! : null;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test server/access/share-link.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add server/env.ts .env.example server/access/share-link.ts server/access/share-link.test.ts
git commit -m "feat(shares): add share link builder and start payload parsing"
```

---

### Task 3: Attribution branch for share links

**Files:**
- Modify: `server/analytics/store.ts:43` (inside `parseStartAttribution`, after the `ref_` branch)
- Test: `server/analytics/analytics.test.ts` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: `parseStartAttribution("pl_<token>")` → `{ source: "share", medium: "telegram", campaign: "shared-playlist", content: "share-<token>", term: null, startParam }`.

- [ ] **Step 1: Write the failing test**

Append to `server/analytics/analytics.test.ts`:

```typescript
test("attributes a shared-playlist start payload to the share channel", () => {
  const attribution = parseStartAttribution("pl_abc123XYZ0");
  expect(attribution.source).toBe("share");
  expect(attribution.medium).toBe("telegram");
  expect(attribution.campaign).toBe("shared-playlist");
  expect(attribution.content).toBe("share-abc123XYZ0");
});
```

If `parseStartAttribution` is not already imported in that file, add it to the existing import from `./store`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test server/analytics/analytics.test.ts`
Expected: FAIL — `source` is `"telegram"` (the generic deep-link fallback), not `"share"`.

- [ ] **Step 3: Add the branch**

In `server/analytics/store.ts`, inside `parseStartAttribution`, immediately after the `ref_` block and before the `startParam.startsWith("utm_")` block:

```typescript
  const shared = /^pl_([A-Za-z0-9]{10})$/.exec(startParam);
  if (shared) {
    return {
      source: "share",
      medium: "telegram",
      campaign: "shared-playlist",
      content: `share-${shared[1]}`,
      term: null,
      startParam,
    };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test server/analytics/analytics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/analytics/store.ts server/analytics/analytics.test.ts
git commit -m "feat(shares): attribute share-link arrivals to their own channel"
```

---

### Task 4: Share routes and the allowlist exemption

**Files:**
- Modify: `server/api/middleware.ts:14` (add `requireAuthAllowUnlisted`)
- Create: `server/api/share-routes.ts`
- Modify: `server/api/routes.ts:20-22` (mount before the global auth)
- Test: `server/api/shares.test.ts`

**Interfaces:**
- Consumes: `publishShare`, `getShare`, `revokeShare`, `listShares`, `recordShareView` from `../access/shares-store`; `buildShareUrl` from `../access/share-link`; `getGeneration` from `../access/generations-store`; `getPlaylist` from `../access/playlists-store`; `getUser` from `../access/users-store`.
- Produces: `createShareRoutes(db: AppDb): Hono<AppEnv>` (mounted under normal auth) and `createPublicShareRoutes(db: AppDb): Hono<AppEnv>` (mounted ahead of it).

- [ ] **Step 1: Write the failing test**

Create `server/api/shares.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";
const OWNER = 777001;
const OUTSIDER = 777002; // never inserted into the allowlist

const { env } = await import("../env");
const { openDb } = await import("../db");
const { upsertUser } = await import("../access/users-store");
const { insertGeneration } = await import("../access/generations-store");
const { createApiRoutes } = await import("./routes");

function buildInitData(chatId: number): string {
  const params = new URLSearchParams();
  params.set("auth_date", String(Math.floor(Date.now() / 1000)));
  params.set("user", JSON.stringify({ id: chatId, first_name: "Test" }));
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(env.telegramBotToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

function freshDb() {
  const db = openDb(":memory:");
  db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [OWNER]);
  upsertUser(db, OWNER);
  return db;
}

function req(app: ReturnType<typeof createApiRoutes>, path: string, chatId: number, init: RequestInit = {}) {
  return app.request(path, {
    ...init,
    headers: { ...init.headers, "X-Telegram-Init-Data": buildInitData(chatId), "content-type": "application/json" },
  });
}

async function publishOwnGeneration(app: ReturnType<typeof createApiRoutes>, db: ReturnType<typeof freshDb>) {
  const id = insertGeneration(db, OWNER, "дождь", "Вечерний драйв", 2, [
    { uri: "ytm:a", title: "One", artist: "A", artwork: "http://x/1.jpg" },
    { uri: "ytm:b", title: "Two", artist: "B" },
  ]);
  const res = await req(app, "/shares", OWNER, {
    method: "POST",
    body: JSON.stringify({ kind: "generation", id }),
  });
  return { id, res, body: (await res.json()) as { token: string; url: string } };
}

describe("share routes", () => {
  test("publishes a generation and returns a stable token and url", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const first = await publishOwnGeneration(app, db);
    expect(first.res.status).toBe(200);
    expect(first.body.token).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(first.body.url).toContain(`start=pl_${first.body.token}`);

    const again = await req(app, "/shares", OWNER, {
      method: "POST",
      body: JSON.stringify({ kind: "generation", id: first.id }),
    });
    expect(((await again.json()) as { token: string }).token).toBe(first.body.token);
  });

  test("refuses to publish a generation the caller does not own", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const foreign = insertGeneration(db, 999999, "чужое", "Чужой", 1, []);
    const res = await req(app, "/shares", OWNER, {
      method: "POST",
      body: JSON.stringify({ kind: "generation", id: foreign }),
    });
    expect(res.status).toBe(404);
  });

  test("a non-allowlisted chat can read a share but cannot publish one", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const { body } = await publishOwnGeneration(app, db);

    const read = await req(app, `/shares/${body.token}`, OUTSIDER);
    expect(read.status).toBe(200);
    const share = (await read.json()) as { name: string; tracks: unknown[]; isOwner: boolean; viewCount: number };
    expect(share.name).toBe("Вечерний драйв");
    expect(share.tracks).toHaveLength(2);
    expect(share.isOwner).toBe(false);

    const publish = await req(app, "/shares", OUTSIDER, {
      method: "POST",
      body: JSON.stringify({ kind: "generation", id: 1 }),
    });
    expect(publish.status).toBe(403);
  });

  test("counts a view once per viewer and never for the owner", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const { body } = await publishOwnGeneration(app, db);
    await req(app, `/shares/${body.token}`, OUTSIDER);
    await req(app, `/shares/${body.token}`, OUTSIDER);
    await req(app, `/shares/${body.token}`, OWNER);
    const owner = (await (await req(app, `/shares/${body.token}`, OWNER)).json()) as {
      viewCount: number;
      isOwner: boolean;
    };
    expect(owner.viewCount).toBe(1);
    expect(owner.isOwner).toBe(true);
  });

  test("unknown token is 404, revoked token is 410", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const { body } = await publishOwnGeneration(app, db);
    expect((await req(app, "/shares/aaaaaaaaaa", OWNER)).status).toBe(404);

    const del = await req(app, `/shares/${body.token}`, OWNER, { method: "DELETE" });
    expect(del.status).toBe(200);
    expect((await req(app, `/shares/${body.token}`, OWNER)).status).toBe(410);
  });

  test("revoking someone else's share is refused", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const { body } = await publishOwnGeneration(app, db);
    expect((await req(app, `/shares/${body.token}`, OUTSIDER, { method: "DELETE" })).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test server/api/shares.test.ts`
Expected: FAIL — `POST /shares` returns 404 (route not mounted).

- [ ] **Step 3: Add the unlisted-auth middleware**

In `server/api/middleware.ts`, refactor so both middlewares share the verification path. Replace the body of `requireAuth` and add the new export:

```typescript
/**
 * Verifies initData and populates the auth context. `allowUnlisted` skips only
 * the allowlist branch — signature verification is identical either way, so an
 * unlisted caller is still a proven Telegram user, just not an admitted one.
 */
function authenticate(db: AppDb, allowUnlisted: boolean): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    // Query fallback: <audio src> (the /stream endpoint) cannot set headers.
    // initData is the same signed credential either way; verifyInitData
    // rejects tampering identically.
    const initData = c.req.header("X-Telegram-Init-Data") ?? c.req.query("initData") ?? "";
    const verified = verifyInitData(initData, env.telegramBotToken);
    if (!verified) {
      return c.json({ error: "unauthenticated" }, 401);
    }
    const role = getChatRole(db, verified.chatId);
    // Admin toggle: open access lets any authenticated Telegram user in;
    // allowlist stays the source of admin rights either way.
    if (!allowUnlisted && !role.isAllowed && !getOpenAccess(db)) {
      return c.json({ error: "forbidden" }, 403);
    }
    c.set("chatId", role.chatId);
    c.set("isAdmin", role.isAdmin);
    c.set("startParam", verified.startParam);
    c.set("telegramUser", verified.user);
    await next();
  };
}

/**
 * Verifies the Mini App's Telegram initData (sent as `X-Telegram-Init-Data`)
 * and rejects any caller not on the allowlist. This is the actual enforcement
 * boundary — the Mini App UI hiding a screen is cosmetic, this is not.
 */
export function requireAuth(db: AppDb): MiddlewareHandler<AppEnv> {
  return authenticate(db, false);
}

/**
 * Authentication without the allowlist gate, for reading a shared playlist.
 * A share link is meant to work for someone who is not a user yet — that is
 * the entire point of it — so this is the one route where a verified but
 * unadmitted chat gets a 200. Never mount anything else on it.
 */
export function requireAuthAllowUnlisted(db: AppDb): MiddlewareHandler<AppEnv> {
  return authenticate(db, true);
}
```

- [ ] **Step 4: Write the share routes**

Create `server/api/share-routes.ts`:

```typescript
import { Hono } from "hono";
import type { AppDb } from "../db";
import type { AppEnv } from "./context";
import { env } from "../env";
import { publishShare, getShare, revokeShare, listShares, recordShareView } from "../access/shares-store";
import { buildShareUrl } from "../access/share-link";
import { getGeneration } from "../access/generations-store";
import { getPlaylist } from "../access/playlists-store";
import { getUser } from "../access/users-store";

let cachedBotUsername: string | null = null;

async function botUsername(): Promise<string> {
  if (cachedBotUsername) return cachedBotUsername;
  const res = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/getMe`);
  const data = (await res.json()) as { ok: boolean; result?: { username: string } };
  cachedBotUsername = data.result?.username ?? "";
  return cachedBotUsername;
}

/**
 * Reading a share is mounted separately, ahead of the allowlist gate — see
 * requireAuthAllowUnlisted. Everything that writes stays behind normal auth.
 */
export function createPublicShareRoutes(db: AppDb): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/shares/:token", (c) => {
    const chatId = c.get("chatId");
    const token = c.req.param("token");
    const share = getShare(db, token);
    if (!share) return c.json({ error: "not found" }, 404);
    if (share.revokedAt !== null) return c.json({ error: "revoked" }, 410);

    recordShareView(db, token, chatId);
    const fresh = getShare(db, token)!;
    const owner = getUser(db, share.ownerChatId);
    return c.json({
      token: fresh.token,
      name: fresh.name,
      prompt: fresh.prompt,
      tracks: fresh.tracks,
      author: { name: owner?.firstName ?? owner?.username ?? null },
      isOwner: chatId === share.ownerChatId,
      viewCount: fresh.viewCount,
      createdAt: fresh.createdAt,
    });
  });

  return app;
}

export function createShareRoutes(db: AppDb): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/shares", (c) => {
    return c.json({ shares: listShares(db, c.get("chatId")) });
  });

  app.post("/shares", async (c) => {
    const chatId = c.get("chatId");
    const body = await c.req.json().catch(() => null);
    const kind = body?.kind === "generation" || body?.kind === "playlist" ? body.kind : null;
    const id = Number(body?.id);
    if (!kind || !Number.isInteger(id)) return c.json({ error: "invalid source" }, 400);

    // Ownership is enforced by the store getters themselves: both take chatId
    // and return null for anyone else's row, so a foreign id is a 404 and never
    // leaks whether it exists.
    let name: string;
    let prompt: string | null;
    let tracks: { uri: string; title: string; artist: string; artwork?: string }[];
    if (kind === "generation") {
      const generation = getGeneration(db, chatId, id);
      if (!generation) return c.json({ error: "not found" }, 404);
      name = generation.playlistName ?? generation.prompt.slice(0, 100);
      prompt = generation.prompt;
      tracks = generation.tracks;
    } else {
      const playlist = getPlaylist(db, chatId, id);
      if (!playlist) return c.json({ error: "not found" }, 404);
      name = playlist.name;
      prompt = null;
      tracks = playlist.tracks.map((t) => ({
        uri: t.uri,
        title: t.title,
        artist: t.artist,
        ...(t.artwork ? { artwork: t.artwork } : {}),
      }));
    }
    if (tracks.length === 0) return c.json({ error: "empty playlist" }, 400);

    const share = publishShare(db, chatId, { sourceKind: kind, sourceId: id, name, prompt, tracks });
    const username = await botUsername();
    return c.json({ token: share.token, url: buildShareUrl(username, share.token), viewCount: share.viewCount });
  });

  app.delete("/shares/:token", (c) => {
    const ok = revokeShare(db, c.get("chatId"), c.req.param("token"));
    if (!ok) return c.json({ error: "forbidden" }, 403);
    return c.json({ ok: true });
  });

  return app;
}
```

Check `getUser`'s return shape in `server/access/users-store.ts` before writing the `author` block; use whatever fields it actually exposes for first name and username, and fall back to `null` when neither is present.

- [ ] **Step 5: Mount the routes**

In `server/api/routes.ts`, import both factories and `requireAuthAllowUnlisted`, then mount the public one **before** `app.use("*", requireAuth(db))`:

```typescript
  // Reading a shared playlist must work for someone who is not a user yet, so
  // it is mounted ahead of the allowlist gate with its own auth. Hono matches
  // in registration order, so this must stay above the app.use("*") below.
  app.use("/shares/:token", requireAuthAllowUnlisted(db));
  app.route("/", createPublicShareRoutes(db));

  app.use("*", requireAuth(db));
```

and add `app.route("/", createShareRoutes(db));` next to the other `app.route` calls.

Note: the `app.use("/shares/:token", ...)` matcher applies to `DELETE /shares/:token` too, but that route is registered later under `createShareRoutes` and its handler re-checks ownership via `revokeShare`, which is scoped by `chatId` — an unlisted caller gets 403 from the store, not access.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun test server/api/shares.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 7: Run the full server suite for regressions**

Run: `bun test`
Expected: PASS — in particular `server/api/access-mode.test.ts`, which asserts an outsider is rejected, must still pass.

- [ ] **Step 8: Commit**

```bash
git add server/api/middleware.ts server/api/share-routes.ts server/api/routes.ts server/api/shares.test.ts
git commit -m "feat(shares): add share publish/read/revoke routes"
```

---

### Task 5: Crediting the author on arrival

**Files:**
- Modify: `server/api/routes.ts:34-40` (the attribution block)
- Modify: `server/bot/index.ts:124-140` (the `/start` handler)
- Test: `server/api/shares.test.ts` (append), `server/bot/share-start.test.ts` (create)

**Interfaces:**
- Consumes: `parseShareToken` from `../access/share-link`, `getShare` from `../access/shares-store`, `applyReferral` from `../access/referral-store`.
- Produces: no new exports; a newcomer arriving with `pl_<token>` gets `referral_events` credited to the share owner exactly once.

- [ ] **Step 1: Write the failing tests**

Append to `server/api/shares.test.ts`:

```typescript
test("a newcomer arriving with a share start param credits the author once", async () => {
  const db = freshDb();
  const app = createApiRoutes(db);
  const { body } = await publishOwnGeneration(app, db);

  const initData = (() => {
    const params = new URLSearchParams();
    params.set("auth_date", String(Math.floor(Date.now() / 1000)));
    params.set("user", JSON.stringify({ id: OUTSIDER, first_name: "New" }));
    params.set("start_param", `pl_${body.token}`);
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    const secretKey = createHmac("sha256", "WebAppData").update(env.telegramBotToken).digest();
    params.set("hash", createHmac("sha256", secretKey).update(dataCheckString).digest("hex"));
    return params.toString();
  })();

  const call = () =>
    app.request(`/shares/${body.token}`, { headers: { "X-Telegram-Init-Data": initData } });
  expect((await call()).status).toBe(200);
  expect((await call()).status).toBe(200);

  const events = db
    .query("SELECT referrer_chat_id AS r FROM referral_events WHERE referred_chat_id = ?")
    .all(OUTSIDER) as { r: number }[];
  expect(events).toHaveLength(1);
  expect(events[0]!.r).toBe(OWNER);
});
```

Create `server/bot/share-start.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";

const { openDb } = await import("../db");
const { upsertUser } = await import("../access/users-store");
const { publishShare } = await import("../access/shares-store");
const { applyReferral } = await import("../access/referral-store");
const { parseShareToken } = await import("../access/share-link");
const { getShare } = await import("../access/shares-store");

const OWNER = 666001;
const NEWCOMER = 666002;

/**
 * Mirrors the /start pl_<token> path in bot/index.ts: resolve the token to its
 * owner, then credit through the same referral entry point the ref_ links use.
 */
function handleShareStart(db: ReturnType<typeof openDb>, chatId: number, startParam: string): boolean {
  const token = parseShareToken(startParam);
  if (!token) return false;
  const share = getShare(db, token);
  if (!share || share.revokedAt !== null) return false;
  return applyReferral(db, share.ownerChatId, chatId);
}

describe("/start pl_<token>", () => {
  test("credits the share owner once and never for a self-open", () => {
    const db = openDb(":memory:");
    db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [OWNER]);
    upsertUser(db, OWNER);
    upsertUser(db, NEWCOMER);
    const share = publishShare(db, OWNER, {
      sourceKind: "generation",
      sourceId: 1,
      name: "Вечерний драйв",
      prompt: "дождь",
      tracks: [{ uri: "ytm:a", title: "One", artist: "A" }],
    });

    expect(handleShareStart(db, NEWCOMER, `pl_${share.token}`)).toBe(true);
    expect(handleShareStart(db, NEWCOMER, `pl_${share.token}`)).toBe(false);
    expect(handleShareStart(db, OWNER, `pl_${share.token}`)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test server/api/shares.test.ts server/bot/share-start.test.ts`
Expected: the API test FAILs with 0 referral events; the bot test FAILs only if `handleShareStart`'s helpers are missing (it should pass once Tasks 1–2 are in — if it passes immediately, that is fine, it is a guard for the logic the bot handler will call).

- [ ] **Step 3: Credit on the Mini App path**

In `server/api/routes.ts`, inside the `app.use("*", ...)` block that records attribution, after `recordAttributionTouch`:

```typescript
      // A share link is also a referral: the author brought this person in, so
      // the same crediting path the ref_ links use applies here. applyReferral
      // is idempotent per invitee, so reopening the link changes nothing.
      const shareToken = parseShareToken(startParam);
      if (shareToken) {
        const share = getShare(db, shareToken);
        if (share && share.revokedAt === null) {
          applyReferral(db, share.ownerChatId, chatId);
        }
      }
```

with the corresponding imports at the top of the file.

- [ ] **Step 4: Credit on the bot path**

In `server/bot/index.ts`, next to the existing `const refMatch = /^ref_(\d+)$/.exec(startParam ?? "");` block, add the share branch. It must run after the existing `upsertUser` so the newcomer's row exists, exactly like the referral branch does:

```typescript
    const shareToken = parseShareToken(startParam);
    if (shareToken) {
      const share = getShare(db, shareToken);
      if (share && share.revokedAt === null) {
        applyReferral(db, share.ownerChatId, ctx.chat.id);
      }
    }
```

Then reply with the shared playlist instead of the plain menu — a card naming the playlist and its author, plus a `web_app` button opening the app on that share:

```typescript
    if (shareToken) {
      const share = getShare(db, shareToken);
      if (share && share.revokedAt === null) {
        const keyboard = new InlineKeyboard().webApp(
          btnText("Слушать", "app"),
          `${env.publicOrigin}/?share=${shareToken}`,
        );
        await ctx.reply(
          [
            messageTitle("music", escapeHtml(share.name)),
            messageHint(`${share.tracks.length} треков`),
          ].join("\n"),
          { reply_markup: keyboard, parse_mode: "HTML" },
        );
        return;
      }
    }
```

Match the surrounding code's existing helpers (`btnText`, `messageTitle`, `messageHint`, `escapeHtml`) and their import sites; if the `/start` handler builds its reply through `buildMenuView`, place this branch before that call and keep the early `return`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test server/api/shares.test.ts server/bot/share-start.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/api/routes.ts server/bot/index.ts server/api/shares.test.ts server/bot/share-start.test.ts
git commit -m "feat(shares): credit the author when someone arrives via a share link"
```

---

### Task 6: Mini App API client and share invocation

**Files:**
- Modify: `miniapp/src/lib/api.ts` (append share methods)
- Modify: `miniapp/src/lib/telegram.ts` (declare `shareMessage` on the WebApp interface)
- Create: `miniapp/src/lib/share.ts`
- Test: `miniapp/src/lib/share.test.ts`

**Interfaces:**
- Consumes: `request` helper in `api.ts`, `getTelegramWebApp` from `./telegram`.
- Produces:
  - `interface SharedPlaylist { token: string; name: string; prompt: string | null; tracks: Track[]; author: { name: string | null }; isOwner: boolean; viewCount: number; createdAt: number }`
  - `api.createShare(kind: "generation" | "playlist", id: number): Promise<{ token: string; url: string }>`
  - `api.getShare(token: string): Promise<SharedPlaylist>`
  - `api.revokeShare(token: string): Promise<{ ok: true }>`
  - `shareUrlToChat(url: string, text: string): void`

- [ ] **Step 1: Write the failing test**

Create `miniapp/src/lib/share.test.ts`:

```typescript
import { describe, expect, test, afterEach } from "bun:test";
import { shareUrlToChat } from "./share";

const originalTelegram = (globalThis as { window?: unknown }).window;

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalTelegram;
});

describe("shareUrlToChat", () => {
  test("opens the Telegram share sheet with the link and text", () => {
    const opened: string[] = [];
    (globalThis as { window: unknown }).window = {
      Telegram: { WebApp: { openTelegramLink: (u: string) => opened.push(u) } },
    };

    shareUrlToChat("https://t.me/bot?start=pl_abc123XYZ0", "Вечерний драйв");

    expect(opened).toHaveLength(1);
    expect(opened[0]).toContain("https://t.me/share/url?url=");
    expect(opened[0]).toContain(encodeURIComponent("https://t.me/bot?start=pl_abc123XYZ0"));
    expect(opened[0]).toContain(encodeURIComponent("Вечерний драйв"));
  });

  test("falls back to a new tab outside Telegram", () => {
    const opened: string[] = [];
    (globalThis as { window: unknown }).window = { open: (u: string) => opened.push(u) };

    shareUrlToChat("https://t.me/bot?start=pl_abc123XYZ0", "Вечерний драйв");

    expect(opened).toHaveLength(1);
    expect(opened[0]).toContain("https://t.me/share/url?url=");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test miniapp/src/lib/share.test.ts`
Expected: FAIL — module `./share` not found.

- [ ] **Step 3: Write the share helper**

Create `miniapp/src/lib/share.ts`:

```typescript
import { getTelegramWebApp } from "./telegram";

/**
 * Opens Telegram's share sheet on a link. This is the guaranteed path — it
 * needs no Bot API version floor and no inline mode, and it is the same
 * mechanism the bot's referral button already uses.
 */
export function shareUrlToChat(url: string, text: string): void {
  const target = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  const webApp = getTelegramWebApp();
  if (webApp?.openTelegramLink) {
    webApp.openTelegramLink(target);
    return;
  }
  window.open(target, "_blank");
}
```

- [ ] **Step 4: Add the API methods**

In `miniapp/src/lib/api.ts`, add the type and the three methods alongside the existing exports, following the file's established shape (the `request<T>` helper and the `api` object):

```typescript
export interface SharedPlaylistTrack {
  uri: string;
  title: string;
  artist: string;
  artwork?: string;
}

export interface SharedPlaylist {
  token: string;
  name: string;
  prompt: string | null;
  tracks: SharedPlaylistTrack[];
  author: { name: string | null };
  isOwner: boolean;
  viewCount: number;
  createdAt: number;
}

// inside the exported api object:
  createShare(kind: "generation" | "playlist", id: number) {
    return request<{ token: string; url: string }>("/api/shares", {
      method: "POST",
      body: JSON.stringify({ kind, id }),
    });
  },
  getShare(token: string) {
    return request<SharedPlaylist>(`/api/shares/${encodeURIComponent(token)}`);
  },
  revokeShare(token: string) {
    return request<{ ok: true }>(`/api/shares/${encodeURIComponent(token)}`, { method: "DELETE" });
  },
```

Check how existing methods build their paths in that file (with or without the `/api` prefix) and match it exactly.

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test miniapp/src/lib/share.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add miniapp/src/lib/share.ts miniapp/src/lib/share.test.ts miniapp/src/lib/api.ts miniapp/src/lib/telegram.ts
git commit -m "feat(shares): add mini app share client and share-sheet helper"
```

---

### Task 7: Shared playlist screen

**Files:**
- Create: `miniapp/src/screens/SharedPlaylistScreen.tsx`
- Modify: `miniapp/src/App.tsx:33-59` (Screen union + `activeTab`), `:126-143` (open on `?share=`)

**Interfaces:**
- Consumes: `api.getShare`, `api.revokeShare`, `SharedPlaylist` from `../lib/api`; the player context used by `ResultsScreen`; `TrackRow`, `EmptyState`, `GlassPanel` components.
- Produces: `SharedPlaylistScreen({ token, onGenerateOwn }: { token: string; onGenerateOwn: (prompt: string | null) => void })`.

- [ ] **Step 1: Write the screen**

Create `miniapp/src/screens/SharedPlaylistScreen.tsx`. Read `ResultsScreen.tsx` first and mirror how it renders a tracklist and starts playback — the shared screen must use the same player, not a second one. The screen shows:

- A 2×2 CSS-grid collage of the first four `track.artwork` values (falling back to a flat panel with the playlist name when fewer than one artwork is present).
- The title: `share.name`.
- Under it, when `share.prompt` is set and the viewer is not the owner: `«{author} собрал по запросу „{prompt}"»`; when the author's name is absent, `«Собрано по запросу „{prompt}"»`; for a shared playlist with no prompt, just the track count.
- The tracklist via `TrackRow`, tapping a row starts playback exactly as on the results screen.
- For a non-owner, two buttons: «Сохранить себе» (calls `api.createPlaylist` then adds each track via `api.addTrackToPlaylist`, matching how `AddToPlaylistSheet.tsx` does it — reuse its calls rather than inventing new ones) and «Сделать свой» (calls `onGenerateOwn(share.prompt)`).
- For the owner, instead: the view count (`{viewCount} просмотров`, with correct Russian plural forms — copy the pluralisation approach from `formatGenerationCount` in `server/bot/referral.ts:24`) and «Отозвать», which calls `api.revokeShare` and then shows the revoked state.
- Loading state via `TrackSkeleton`, error state via `ErrorBanner`, 404/410 via `EmptyState` with «Ссылка больше не действует».

- [ ] **Step 2: Wire it into App.tsx**

Add to the `Screen` union:

```typescript
  | { kind: "shared"; token: string }
```

Add to `activeTab`, returning `"create"` for `"shared"` (it belongs to the create flow — the recipient's next action is generating their own).

In the mount effect that reads `?tab=`, before those checks:

```typescript
    // A share link opened through the bot lands here with ?share=<token>;
    // opened through startapp it arrives as Telegram's start_param instead.
    const shareParam =
      new URLSearchParams(window.location.search).get("share") ??
      parseShareStartParam(new URLSearchParams(getInitData()).get("start_param"));
    if (shareParam) navigate({ kind: "shared", token: shareParam });
    else if (tabParam === "playlists") navigate({ kind: "playlists" });
```

with a small local `parseShareStartParam` mirroring the server's regex (`/^pl_([A-Za-z0-9]{10})$/`).

Render it in `renderScreen()`:

```typescript
      case "shared":
        return (
          <SharedPlaylistScreen
            token={screen.token}
            onGenerateOwn={(prompt) => navigate({ kind: "prompt", initialQuery: prompt ?? undefined })}
          />
        );
```

- [ ] **Step 3: Type-check and build**

Run: `bun run typecheck && cd miniapp && bun run build`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add miniapp/src/screens/SharedPlaylistScreen.tsx miniapp/src/App.tsx
git commit -m "feat(shares): add the shared playlist screen"
```

---

### Task 8: Share actions on results and playlists

**Files:**
- Modify: `miniapp/src/screens/ResultsScreen.tsx`
- Modify: `miniapp/src/screens/PlaylistsScreen.tsx`

**Interfaces:**
- Consumes: `api.createShare` from `../lib/api`, `shareUrlToChat` from `../lib/share`.
- Produces: no new exports.

- [ ] **Step 1: Add the action to the results screen**

In `ResultsScreen.tsx`, add a «Поделиться» button next to the existing actions (match how «Скачать» is rendered — same button component, same row). Its handler:

```typescript
  async function share() {
    setSharing(true);
    try {
      const { url } = await api.createShare("generation", generationId);
      shareUrlToChat(url, playlist.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать ссылку");
    } finally {
      setSharing(false);
    }
  }
```

using whatever error and loading state the screen already has rather than adding parallel ones.

- [ ] **Step 2: Add the action to the playlists screen**

In `PlaylistsScreen.tsx`, add the same «Поделиться» action to a playlist's actions, calling `api.createShare("playlist", playlist.id)`. Follow the file's existing per-playlist action pattern (rename/delete) for placement and styling.

- [ ] **Step 3: Type-check and build**

Run: `bun run typecheck && cd miniapp && bun run build`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add miniapp/src/screens/ResultsScreen.tsx miniapp/src/screens/PlaylistsScreen.tsx
git commit -m "feat(shares): add share actions to results and playlists"
```

---

### Task 9: Documentation and full verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the feature**

Add a section to `README.md` after "Audio downloads & in-app playback":

```markdown
## Sharing playlists

Any generation result or saved playlist can be published as a link
(«Поделиться»). Publishing snapshots the tracklist, so editing or deleting the
source never changes a link already in circulation, and publishing the same
source twice returns the same link. Recipients open it in Telegram, see the
tracklist with the author and original prompt, play it in the Mini App, and can
save it or generate their own.

Links take the form `https://t.me/<bot>?start=pl_<token>`. Set the optional
`TELEGRAM_MINIAPP_NAME` (the Mini App short name from BotFather) to have them
open the Mini App directly as `https://t.me/<bot>/<name>?startapp=pl_<token>`
instead.

Arrivals are attributed to `share / telegram / shared-playlist` in admin
statistics and credit the author through the existing referral reward, with the
same per-invitee dedupe and cap. `GET /api/shares/:token` is the one route that
serves callers who are not on the allowlist — that is what lets a link work for
someone who is not a user yet. Authors can revoke a link at any time (it then
answers 410) and see its view count.
```

- [ ] **Step 2: Run everything**

Run: `bun test && bun run typecheck && cd miniapp && bun run build`
Expected: all green. Report the actual output — do not claim success without it.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document playlist sharing"
```

---

## Self-review

**Spec coverage:** data model → Task 1; routes and the auth exemption → Task 4; link intake and attribution → Tasks 2, 3, 5; recipient screen → Task 7; share card → Tasks 6, 8 (with the collage deviation stated above); testing → distributed across tasks; "not doing" list respected (no public web view, no live shares, no inline mode).

**Placeholders:** none. The two places that say "match the existing pattern" (`getUser`'s shape in Task 4, the api path prefix in Task 6, the results-screen button styling in Task 8) point at a specific file to read rather than deferring a decision.

**Type consistency:** `ShareSnapshot`/`ShareInput` in Task 1 are consumed unchanged in Task 4; `buildShareUrl`/`parseShareToken` in Task 2 are consumed in Tasks 3, 4, 5, 7; `SharedPlaylist` in Task 6 is consumed in Task 7. `sourceKind` is `"generation" | "playlist"` everywhere; the wire field is `kind` in the POST body and `sourceKind` in the store, which the route translates.
