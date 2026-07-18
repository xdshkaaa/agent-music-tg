# player-artists-playlists

## Why

The player, search, and playlist surfaces work but feel unfinished: no way to react to tracks, no lyrics, a tap-only progress bar, dead-end artist names, no artist search results, no way to file a track into a personal playlist, and bot messages with inconsistent formatting. This change brings them to a polished, production-ready state.

## What Changes

- **Player reactions**: Dislike button (left) and Like button (right) flanking the transport controls. Like = save to Favorites (existing `saved_tracks`); Dislike = per-user dislike list used to de-prioritize future generations.
- **Real-time lyrics**: dedicated lyrics button in the player opens a lyrics view synced to playback position (LRCLIB synced-lyrics lookup, plain-text fallback, graceful "no lyrics" state).
- **Progress slider**: upgrade from tap-only to full drag with enlarged hit area, matching the volume slider's pointer UX.
- **Artist navigation**: artist name in the player is tappable and opens the artist page.
- **Artist search**: `/api/search` results include artist cards alongside tracks; new artist page shows top tracks, latest albums, popular releases (backend-permitting), with a proper loading state and no placeholder-looking UI.
- **Playlist navigation**: explicit Back button when inside a playlist, returning to the Музыка section.
- **Add to Playlist**: button next to Play on a track; sheet to pick an existing playlist or create a new one; free users capped at 2 playlists, extra slots purchasable with Telegram Stars (5⭐ per extra slot bundle).
- **Favorites refactor**: Favorites opens with the same UI as Saved Music; generation results merge Download + Add-to-Favorites into one combined action.
- **Bot message cleanup**: remove unnecessary em dashes, consistent HTML formatting, shorter cleaner copy across all bot messages.

## Capabilities

### New Capabilities

- `player-reactions`: like/dislike buttons in the fullscreen player, persistence, and effect on generation.
- `player-lyrics`: synced real-time lyrics screen launched from the player.
- `artist-pages`: artist search results and a dedicated artist page (top tracks, albums, releases) with loading states.
- `user-playlists`: user-owned playlists — create, list, add tracks, slot limits, Stars-purchased extra slots.

### Modified Capabilities

- `player-screen`: progress slider becomes draggable with enlarged hit area; artist name becomes a navigation control; reaction and lyrics buttons join the layout.
- `screen-refinement`: playlist detail gains a Back-to-Music control; Favorites reuses Saved Music UI; results screen merges Download + Favorite actions.
- `payments`: Telegram Stars added as a payment method for playlist slot purchases.

## Impact

- **Mini App**: `PlayerScreen.tsx` (reactions, lyrics button, slider, artist link), new `ArtistScreen` and `LyricsScreen`, `PlaylistsScreen.tsx` (back button, playlist CRUD UI), `ResultsScreen.tsx` (merged actions), `App.tsx` routing, `lib/api.ts`, `glass.css`.
- **Server**: new routes for reactions, lyrics proxy, artist search/page, playlists CRUD + Stars invoice; new stores (`playlists-store`, dislikes in or beside `saved-tracks-store`); `server/music/*` may need artist-albums support; bot `pre_checkout_query`/`successful_payment` handlers for Stars.
- **Bot**: message copy pass across `server/bot/*.ts`.
- **DB**: new tables `playlists`, `playlist_tracks`, `track_reactions`, playlist-slot balance on users.
- **External**: LRCLIB API (free, no key) for lyrics.
