# Security review — spotify-harness-tg

Scope: server (Bun/Hono, bot long-polling, payments, audio), Mini App (React).
Reviewed: auth/middleware, webhooks (Crypto Pay, Platega), payments/fulfillment,
offers/purchase, access-control, entitlements, audio extractor + stream cache,
music backends (YTMusic, SoundCloud), agent tools, bot admin panel, DB layer, env.

## Severity summary

| # | Issue | Surface | Severity | Touches backend? |
|---|-------|---------|----------|-------------------|
| 1 | SoundCloud `artistId` path/SSRF injection | music backend | Medium | Yes (hardening) |
| 2 | `/stream` extract-on-demand for arbitrary `ytm:`/`sc:` uri | audio routes | Low | Yes (defense) |
| 3 | `initData` echoed into `/stream` query string | api client/server | Low | No (client) |
| 4 | Admin grant flow only loosely parses `admin` keyword | bot admin | Info | No (already gated) |
| 5 | Server has no global rate limit / abuse ceiling on `/generate` for credit users | api | Low | Yes (defense) |
| 6 | `formatPrice`/crypto button removed client-side but server still accepts `method:"crypto"` | api/miniapp | Info | Mixed |

## Findings

### 1. SoundCloud `artistId` interpolated into fetch URL path (Medium)
`server/music/soundcloud-backend.ts:114`
```ts
const data = await this.request(`/users/${artistId}/toptracks?limit=${limit}`);
```
`artistId` originates from `searchArtist` (line 106-111), whose value is returned
by the SoundCloud API and then handed to the agent as a tool result. The agent is
prompted to pass it back verbatim via `getArtistTopTracks`. A crafted/odd value
(e.g. `0/../internal` or a `//evil.host` style segment) is concatenated into the
request path with no validation, allowing request-path manipulation and, in the
worst case, SSRF against an internal host if the scraped client_id + path were
abused. The `limit` from the agent is also unclamped.

Fix: validate `artistId` against the expected SoundCloud id shape (digits) before use,
and clamp `limit`. Same guard applied to `searchTracks`/`searchTrack` `limit`.

### 2. `/stream` triggers yt-dlp for any `ytm:`/`sc:` uri (Low)
`server/api/audio-routes.ts:109` — `/stream/:uri` only checks `isValidTrackUri`
(`^(ytm|sc):[\w-]+$`), then calls `streamCache.getFile(uri)` which shells out
to `yt-dlp` for that id. Any authenticated user can therefore ask the server to
fetch/transcode an arbitrary video/track id. Blast radius is bounded (ids are
opaque, output is audio only, no admin action), but it is an unauthenticated-to-
the-host compute/SSRF-ish primitive reachable by any allowlisted user.

Fix (defense): require the uri to have been seen in a prior generation for this
chat (or at least ownership of an extraction), OR keep as-is but document it is
intentional. Recommend gating `/stream` on "uri belongs to this chat's generation
history". This is a backend change touching audio-routes; flagged, not auto-applied.

### 3. `initData` placed in `/stream` query string (Low, client)
`miniapp/src/lib/api.ts` `streamUrl()`:
```ts
return `/api/stream/${encodeURIComponent(uri)}?initData=${encodeURIComponent(getInitData())}`;
```
Telegram `initData` is a signed credential. Putting it in a URL query string
means it lands in proxy/access logs and the browser history. It is already verified
server-side and short-lived (24h), so impact is limited, but the credential should
ride in a header where possible. `<audio>` cannot set headers, so this is a known
constraint. Mitigation already present: `verifyInitData` enforces `MAX_INIT_DATA_AGE`.
Recommend: shorten the accepted age for stream URLs, and ensure logs scrub `initData`.

### 4. Admin grant keyword parsing (Info)
`server/bot/admin-panel.ts:447` `const isAdmin = text.includes("admin");` only
matters inside the `admin_access_add` flow, which is reached only when the caller
is already `ctx.isAdmin` (the whole `handleAdminText` is gated). No privilege
escalation path. Lowered to Info; optionally tighten to a boolean flag button.

### 5. No global abuse ceiling on `/generate` (Low)
Credit/trial users are charged per generation, so cost is bounded, but there is no
global concurrency/rate ceiling, so a compromised allowlisted account can drive
unbounded LLM + yt-dlp load. Recommend a per-chat and global in-flight cap.

### 6. Client/server method mismatch (Info)
`PaymentMethod` on the client dropped `"crypto"` and the crypto buy button was
removed (`BuyScreen.tsx`), yet `server/api/routes.ts:341` still accepts
`method: "crypto"`. Harmless (server is the source of truth, and `requireAuth` +
`requireAdmin` are enforced server-side), but it is dead/confusing code. Clean up.

## What was already done well
- Telegram `initData` verified with HMAC-SHA256 + 24h staleness check
  (`lib/telegram-init-data.ts`).
- Crypto Pay webhook signature verified constant-time against `SHA256(token)`
  (`payments/webhook.ts`).
- Platega webhook authenticated by constant-time header compare
  (`payments/platega.ts`).
- All SQL uses parameterized queries / `bun:sqlite` `.query().run(...)` —
  no string interpolation of user input into SQL (no SQLi).
- All admin routes enforced by `requireAdmin` middleware, not just UI hiding.
- Payment fulfillment is idempotent via the `pending->paid` transition inside a
  transaction (`payments/fulfillment.ts`).
- Platega webhook re-checks amount/currency against the stored invoice before
  granting (`server/index.ts`).
- Bot `allowlistGate` drops unknown chats with no reply (no info leak).
- Track URIs are validated against a strict pattern before any yt-dlp call.

## Applied fixes (safe, non-breaking)
- (backend) #1: validate `artistId` + clamp `limit` in `soundcloud-backend.ts`.
- (client) #6: removed dead `crypto` branch references are left to server; client
  type already cleaned.

## Suggested follow-ups (require backend decision / deploy)
- #2 gating `/stream` on per-chat generation ownership.
- #5 global generation concurrency cap + global rate limit.
- #3 scrub `initData` from logs; consider shorter stream URL TTL.
- #4 replace `text.includes("admin")` with an explicit admin/role selection.
