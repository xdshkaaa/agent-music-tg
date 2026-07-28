# Playlist sharing — design

## Summary

A user publishes a generation result or a saved playlist as a link
(`https://t.me/<bot>/<app>?startapp=pl_<token>`) and sends it into any Telegram
chat. The recipient opens the Mini App on a dedicated screen, sees the full
tracklist with the author's name and the original prompt, plays it with the
existing player, and can save it or generate their own. A recipient who is not
yet a user is admitted, attributed to the `share / telegram` channel, credited
to the author through the existing referral mechanics, and given the existing
trial.

Goal: growth. The shared object is a *playlist*, not the bot — the reason to
send it is "look what this made for me", which is a thing people already want
to send.

## Scope

In: share link creation, snapshot storage, recipient screen, link intake and
attribution, referral crediting, rich share card in chat with fallback.

Out: public web viewing outside Telegram (links always open the Mini App),
live-updating shares, bot inline mode.

## Data model (migration v20)

```sql
CREATE TABLE playlist_shares (
  token TEXT PRIMARY KEY,               -- base62, 10 chars, crypto-random
  owner_chat_id INTEGER NOT NULL,
  source_kind TEXT NOT NULL,            -- 'generation' | 'playlist'
  source_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  prompt TEXT,                          -- generation only, NULL for playlists
  tracks_json TEXT NOT NULL,            -- snapshot taken at publish time
  view_count INTEGER NOT NULL DEFAULT 0,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_playlist_shares_owner
  ON playlist_shares(owner_chat_id, created_at DESC);
CREATE UNIQUE INDEX idx_playlist_shares_source
  ON playlist_shares(owner_chat_id, source_kind, source_id)
  WHERE revoked_at IS NULL;

CREATE TABLE playlist_share_views (
  token TEXT NOT NULL REFERENCES playlist_shares(token) ON DELETE CASCADE,
  viewer_chat_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (token, viewer_chat_id)
);
```

Three decisions encoded here:

- **Snapshot, not reference.** `tracks_json` is copied at publish time, so
  editing or deleting the source playlist never changes or breaks a link that
  is already circulating, and the privacy model is "what you showed is what
  they see".
- **Idempotent publish.** The partial unique index means a second "Поделиться"
  on the same source returns the existing token instead of minting a new one.
  Users tap share repeatedly; that must not produce a pile of dead links.
- **Revoke, don't delete.** `revoked_at` distinguishes 410 (author took it
  down) from 404 (never existed), and keeps view stats after revocation.

`playlist_share_views` makes the view counter idempotent per viewer — one row
per `(token, viewer)`, so a recipient reopening the link does not inflate it.

Store: `server/access/shares-store.ts`, following `playlists-store.ts` in shape
and naming.

## Server routes (`server/api/share-routes.ts`, new file)

- `POST /api/shares` `{ kind: 'generation' | 'playlist', id: number }` →
  `{ token, url }`. Verifies the caller owns the source (`generations.chat_id`
  / `playlists.chat_id` equals `chatId`), builds the snapshot, inserts or
  returns the existing row, and renders the link from the bot username and
  Mini App short name. Rate-limited through the existing `lib/rate-limit.ts`.
- `GET /api/shares/:token` → `{ name, prompt, tracks, author: { name, photo },
  isOwner, viewCount, createdAt }`. 404 unknown, 410 revoked. Records a view
  row (and increments `view_count`) only when the caller is not the owner.
- `DELETE /api/shares/:token` → revoke. Owner only, 403 otherwise.
- `GET /api/shares` → the caller's own shares with view counts, for the
  profile tab.

### The auth exemption

`requireAuth` (`server/api/middleware.ts:29`) rejects any chat that is not on
the allowlist with 403 unless open access is on. That check is the entire
paywall surface the recipient would hit — the channel-subscription gate is
bot-only (`server/bot/channel-subscription-gate.ts`) and the generation paywall
lives inside `run-generation.ts`, so neither touches this flow.

For the funnel to work, `GET /api/shares/:token` must still verify initData but
must not require allowlist membership. Implementation: a second middleware
`requireAuthAllowUnlisted(db)` in `api/middleware.ts` that shares the initData
verification path with `requireAuth` and skips only the allowlist branch, with
the share-view route mounted on it *before* the global `app.use("*",
requireAuth(db))` in `api/routes.ts`, matching how the Crypto Pay webhook is
already mounted ahead of auth in `server/index.ts`.

Everything else — publishing, revoking, listing — keeps the normal
`requireAuth`. Only reading a share is open.

## Link intake

`parseStartAttribution` (`server/analytics/store.ts:43`) gains a `pl_<token>`
branch alongside the existing `ref_`, `utm_`, and `src_` branches:

```
source: "share", medium: "telegram", campaign: "shared-playlist",
content: `share-${token}`
```

so the existing funnel report separates this channel without new analytics
code.

Both entry points then credit the author:

- Mini App: `server/api/routes.ts:34` already reads `startParam` and records
  attribution. Add: if it matches `pl_<token>`, look up the share and call
  `applyReferral(db, share.owner_chat_id, chatId)`.
- Bot: `server/bot/index.ts:124` already parses `/start` payloads and handles
  `ref_(\d+)` at line 138. Add the `pl_` case next to it, resolving the token
  to an owner and calling the same `applyReferral`.

`applyReferral` (`server/access/referral-store.ts:26`) already handles
self-referral, unknown referrer, duplicate invitee, and the per-user cap, so
share-driven signups reuse the referral economy exactly — no second reward
system, no new balancing. The trial for the newcomer is whatever the existing
trial mechanism grants; this design does not change it.

## Mini App

New screen `miniapp/src/screens/SharedPlaylistScreen.tsx`, opened when
`start_param` matches `pl_<token>` instead of the prompt screen:

- Collage artwork, `«<Имя> собрал по запросу „…"»` (or just the name for a
  shared playlist, which has no prompt).
- Tracklist rendered with the existing `TrackRow`, playback through the
  existing player — a shared playlist plays like any other.
- Two actions: «Сохранить себе» (copies the snapshot into the viewer's
  playlists) and «Сделать свой» (goes to the prompt screen prefilled with the
  original prompt when there is one).
- When the viewer is the owner: view counter and «Отозвать» instead.

A «Поделиться» action is added to the results screen and to each saved
playlist.

## Share card in chat

Preferred path: the server calls `savePreparedInlineMessage` to build a card
(collage photo, playlist name, «Открыть» button pointing at the share link) and
returns `prepared_message_id`; the Mini App calls
`Telegram.WebApp.shareMessage(id)`, which opens the chat picker and sends the
card.

The exact Bot API requirements for `savePreparedInlineMessage` (version floor,
and whether the bot needs inline mode enabled) are verified during
implementation, not assumed here. Regardless of that outcome, the fallback is
built and tested first: `https://t.me/share/url?url=<link>&text=<text>`, the
same mechanism already used in `server/bot/referral.ts:53`. The Mini App uses
the prepared-message path only when `shareMessage` exists on the WebApp object
and the server call succeeds, and falls back otherwise. The feature therefore
does not depend on a single API version.

Collage: 2×2 grid of track artworks, rendered server-side and cached by token.
When artwork is missing, a flat panel with the playlist name.

## Testing

Store (`shares-store.test.ts`):
- publishing the same source twice returns one token
- revoking then republishing mints a new token
- the snapshot still reads back after the source playlist is deleted
- a view is counted once per viewer, never for the owner

Routes (`share-routes.test.ts`):
- publishing someone else's generation or playlist → 403
- reading an unknown token → 404, a revoked one → 410
- a non-allowlisted chat can read a share but cannot publish one
- deleting as a non-owner → 403

Intake (extends `analytics.test.ts` / bot start tests):
- `pl_<token>` yields `share / telegram` attribution
- a newcomer arriving via a share credits the author exactly once
- the author opening their own link credits nobody

Mini App:
- the shared screen renders from a snapshot payload
- sharing falls back to `t.me/share/url` when `shareMessage` is absent
