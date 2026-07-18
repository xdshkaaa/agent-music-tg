# Design: player-artists-playlists

## Context

Mini App (React + Vite, glass design system) with a fullscreen `PlayerScreen`, search over `/api/search` (tracks) and `/api/search/albums`, a `PlaylistsScreen` (library: saved tracks, downloads, history), and generation results in `ResultsScreen`. Server is Bun + Hono with `bun:sqlite`; music backends (`MusicProvider`) already expose `searchArtist` and `getArtistTopTracks`. Favorites exist as `saved_tracks` (server/access/saved-tracks-store.ts) with `/api/my-music` routes. Payments today: CryptoBot + СБП. The bot (grammY, long-polling) has a copy pass pending.

## Goals / Non-Goals

**Goals:**
- Reactions (like/dislike) in the player with server persistence and generation impact.
- Synced lyrics screen (LRCLIB) tied to playback position.
- Draggable progress slider with volume-slider-grade pointer UX.
- Artist cards in search + a real artist page with loading skeletons.
- User playlists with add-to-playlist flow, 2-free limit, Stars-purchased slots.
- Favorites/Saved-Music UI unification and merged Download+Favorite action.
- Bot copy cleanup (em dashes, HTML consistency, brevity).

**Non-Goals:**
- Remote playlists on the music service side (`capabilities.remotePlaylists` stays false).
- Related-artists / singles / EPs beyond what `ytmusic-api` exposes cheaply (optional, only if the wrapped API already returns them).
- Selling generations/subscriptions via Stars (Stars only for playlist slots here).
- Offline lyrics caching in the client.

## Decisions

### D1: Reactions storage — one `track_reactions` table, Like stays `saved_tracks`
Like is defined as "in Favorites": toggling Like calls the existing `/api/my-music` add/remove. Dislike gets a new `track_reactions` table (`chat_id, uri, reaction='dislike', title, artist, created_at`). Rationale: avoids duplicating the favorites concept; dislike needs title/artist so `generate-playlist` can pass an exclusion list ("не предлагай: …") into the agent prompt and post-filter results by uri.
*Alternative:* single reactions table for both — rejected, would fork Favorites into two sources of truth.

### D2: Lyrics via LRCLIB proxied server-side
New route `GET /api/lyrics?artist=&title=&duration=` calling `https://lrclib.net/api/get` (exact) then `/api/search` (fuzzy fallback). Returns `{ synced: [{t, line}] } | { plain } | { notFound }`. Cached in a `lyrics_cache` sqlite table keyed by normalized artist+title (TTL ~30 days, not-found cached ~1 day). Rationale: free, no key, has Russian catalog coverage; proxying keeps CSP/auth uniform and enables caching.
*Alternative:* client fetches LRCLIB directly — rejected: CORS/origin exposure, no shared cache.

Client: `LyricsScreen` layered over the player (same overlay pattern as PlayerScreen), consumes `currentTime` from the player context; binary-search current line, `scrollIntoView({block:'center'})` with smooth behavior, tap line → `player.seek`.

### D3: Progress slider — reuse the VolumeControl drag pattern
Rewrite the progress bar with the same pointer-capture drag logic as `VolumeControl` (pointerdown → capture → move updates local drag ratio → release commits `player.seek`). Enlarged hit area via padded wrapper (~28px tall) with the visual track inside. While dragging, current-time label previews the drag position and the audio element is not seeked until release (prevents stutter). Must respect PlayerScreen's swipe-to-close guard (already excludes `[role='slider']`).

### D4: Artist search & page — extend `MusicProvider` minimally
- `/api/search` response becomes `{ tracks, artists }` (artists from `provider.searchArtist`-adjacent search; for ytm use `api.searchArtists(query)` top N with thumbnails). Keep backward-compat: existing `tracks` field unchanged.
- New route `GET /api/artist?id=` returning `{ name, artwork, topTracks, albums }`. Provider interface gains `getArtistAlbums(artistId)` (ytm: `getArtist(id)` already returns albums/singles in `ytmusic-api`; soundcloud: return `[]`). Sections with empty arrays are omitted client-side.
- New `ArtistScreen` in the Mini App, routed from search cards and the player's artist name (player passes artist name → screen resolves id via `searchArtist` if no id at hand). Skeleton rows while loading; retry state on failure. No placeholder-looking finals: sections render only with data.

### D5: User playlists — server-side tables + slot balance
Tables: `playlists (id, chat_id, name, created_at)`, `playlist_tracks (playlist_id, uri, title, artist, artwork, position, created_at, UNIQUE(playlist_id, uri))`. Slot balance: `users.extra_playlist_slots INTEGER DEFAULT 0` (users table exists for payments). Limit check on create: `count < 2 + extra_playlist_slots`, else 403 with `{ error: "limit", starsPrice }`.
Routes: `GET/POST /api/playlists`, `PATCH/DELETE /api/playlists/:id`, `POST/DELETE /api/playlists/:id/tracks`. Add-to-playlist picker is a bottom sheet listing playlists + «Создать плейлист».

### D6: Stars purchase — bot-issued XTR invoice link
`POST /api/playlists/slots/invoice` → server calls Bot API `createInvoiceLink` with `currency: "XTR"`, price 5⭐ per slot, payload `slots:<chatId>:<n>:<nonce>`. Mini App opens it via `webApp.openInvoice`. Bot handles `pre_checkout_query` (approve) and `successful_payment` (grant slots, idempotent by `telegram_payment_charge_id` recorded in a `stars_payments` table). Rationale: Stars requires bot invoices; `openInvoice` keeps the flow inside the Mini App.
*Alternative:* sending invoice message to chat — worse UX, still supported implicitly as fallback since the link works anywhere.

### D7: Favorites/Saved unification + merged action
Favorites entry opens the existing Saved Music list component (extracted if needed) rather than a separate layout. In `ResultsScreen`, the per-track Download and Favorite buttons merge into one action: queue download (existing `/api/download`) and `POST /api/my-music` in the same handler; icon reflects saved state.

### D8: Bot copy pass
Mechanical sweep over `server/bot/*.ts` user-facing strings: replace em dashes used as separators with colons/periods (keep them where genuinely needed in Russian typography, e.g. numeric ranges stay hyphens), consistent `<b>`/`<i>` HTML usage with `parse_mode: "HTML"` everywhere a formatted string is sent, shorter sentences. Admin-panel table "—" placeholders for empty values stay (data, not prose).

## Risks / Trade-offs

- [LRCLIB misses many Russian/underground tracks] → distinct friendly empty state; fuzzy search fallback; cache not-found briefly so retries stay cheap.
- [ytmusic-api artist payload shape drift] → wrap in try/catch per section; page renders whatever sections resolved.
- [Stars payments need bot ↔ server shared db access] → both already share `AppDb`; grant path reuses the payments idempotency pattern from CryptoBot fulfillment.
- [Dislike exclusion inflates agent prompt] → cap exclusion list passed to the LLM (e.g. most recent 50), still hard-filter all dislikes post-generation by uri.
- [Slider drag vs swipe-to-close conflict] → existing guard excludes sliders from swipe capture; verify on touch devices via Chrome emulation before ship.
- [Search response shape change] → additive (`artists` field); old clients ignore it.

## Migration Plan

1. DB migrations in `server/db.ts` (`track_reactions`, `playlists`, `playlist_tracks`, `lyrics_cache`, `stars_payments`, `users.extra_playlist_slots`) — additive, no rollback needed beyond ignoring tables.
2. Server routes + provider extension; bot payment handlers; bot copy pass.
3. Mini App screens/components; typecheck + build.
4. Deploy via `./deploy/deploy-test.sh`, verify on test bot, then prod per user instruction.

## Open Questions

- Exact Stars pricing granularity (5⭐ = 1 slot assumed; confirm with user before wiring offer text).
- Whether dislike should also skip to the next track immediately (assumed: no auto-skip, just persist).
