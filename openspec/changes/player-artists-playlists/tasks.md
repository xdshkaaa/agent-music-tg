# Tasks: player-artists-playlists

## 1. Database & Stores

- [x] 1.1 Add migrations in `server/db.ts`: `track_reactions`, `playlists`, `playlist_tracks`, `lyrics_cache`, `stars_payments`, `users.extra_playlist_slots`
- [x] 1.2 Create `server/access/reactions-store.ts` (dislike add/remove/list; like delegates to saved-tracks)
- [x] 1.3 Create `server/access/playlists-store.ts` (CRUD, track add/remove with UNIQUE idempotency, count, slot balance helpers)
- [x] 1.4 Store tests: reactions mutual exclusivity, playlist limit math, duplicate track add

## 2. Server — Lyrics

- [x] 2.1 Create `server/core/lyrics.ts`: LRCLIB exact + fuzzy lookup, LRC parsing to `{t, line}[]`, sqlite cache with TTL
- [x] 2.2 Route `GET /api/lyrics` (initData-authed) returning synced/plain/notFound
- [x] 2.3 Tests for LRC parsing and cache behavior

## 3. Server — Artists

- [x] 3.1 Extend `MusicProvider` with `searchArtists(query, limit)` (cards) and `getArtistAlbums(artistId)`; implement for youtube-backend, stub `[]` for soundcloud
- [x] 3.2 Extend `GET /api/search` response with `artists` array (additive)
- [x] 3.3 Route `GET /api/artist?id=` returning name, artwork, topTracks, albums; per-section try/catch
- [x] 3.4 Route or param to resolve artist by name (for player artist-name navigation)

## 4. Server — Playlists & Stars

- [x] 4.1 Playlist routes: `GET/POST /api/playlists`, `PATCH/DELETE /api/playlists/:id`, `POST/DELETE /api/playlists/:id/tracks`; 403 `{error:"limit"}` past `2 + extra_playlist_slots`
- [x] 4.2 Route `POST /api/playlists/slots/invoice` → `createInvoiceLink` (XTR, 5⭐/slot, nonce payload)
- [x] 4.3 Bot: `pre_checkout_query` approval + `successful_payment` handler granting slots idempotently via `stars_payments`
- [x] 4.4 Tests: limit enforcement, idempotent grant

## 5. Server — Reactions & Generation

- [x] 5.1 Routes: `POST/DELETE /api/reactions/dislike` (dislike removes favorite if present); like continues through `/api/my-music`
- [x] 5.2 `generate-playlist.ts`: pass capped dislike exclusion list into agent prompt; hard-filter disliked uris from results
- [x] 5.3 Test: generation excludes disliked tracks

## 6. Mini App — Player

- [x] 6.1 Rebuild progress slider with VolumeControl-style pointer drag, enlarged hit area, drag-preview time, seek-on-release
- [x] 6.2 Add Dislike (left) / Like (right) buttons around transport controls; active states; wire to API; initial state from saved/dislike lists
- [x] 6.3 Make artist name tappable → ArtistScreen
- [x] 6.4 Lyrics button + `LyricsScreen` overlay: synced highlight via binary search on `currentTime`, auto-scroll, tap-to-seek, plain/empty fallbacks
- [x] 6.5 CSS for new controls in `glass.css`, consistent with the design system (check anti-slop law: no glow pills, verify centering, hit areas, contrast)

## 7. Mini App — Search & Artist

- [x] 7.1 Artist cards in search results (distinct from track rows), from new `artists` field
- [x] 7.2 `ArtistScreen`: header, top tracks (playable), albums → existing album-tracks flow; skeleton loading; retry error state; omit empty sections
- [x] 7.3 Routing in `App.tsx` for ArtistScreen (from search, player, album rows)

## 8. Mini App — Playlists & Favorites

- [x] 8.1 Back button in playlist detail → Музыка section, scroll state preserved
- [x] 8.2 Add-to-Playlist button beside Play on track rows; bottom-sheet picker (existing playlists + create-new); limit prompt with Stars purchase via `openInvoice`
- [x] 8.3 Playlist CRUD UI in `PlaylistsScreen` (create, rename, delete, view tracks, play)
- [x] 8.4 Favorites opens the shared Saved Music list component (extract if needed)
- [x] 8.5 `ResultsScreen`: merge Download + Favorite into one combined action with saved-state icon

## 9. Bot Copy Pass

- [x] 9.1 Sweep `server/bot/*.ts` strings: drop separator em dashes, consistent HTML formatting, shorter copy (keep "—" as empty-value placeholder in admin tables)
- [x] 9.2 Verify every formatted reply sends `parse_mode: "HTML"`

## 10. Verify & Ship

- [x] 10.1 `bun test`, `bun run typecheck`, `bun run build:miniapp`
- [ ] 10.2 Browser walkthrough (Chrome DevTools MCP): slider drag, reactions, lyrics sync, artist page load/error, playlist flows, merged action; re-check anti-slop law points on all new UI
- [x] 10.3 Deploy via `./deploy/deploy-test.sh`; verify Stars invoice flow on test bot
