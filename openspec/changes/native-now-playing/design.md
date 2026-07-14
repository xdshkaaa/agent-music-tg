## Context

The Mini App's audio player (`miniapp/src/lib/player.tsx`) uses a raw `<audio>` element with a React context wrapper (`PlayerProvider`). It supports play/pause/toggle, seek, volume control, and mute. There is no track queue concept — each `toggle(track)` call replaces the current track. The `PlayerBar` component at the bottom of the app shows track title, artist, and playback controls.

iOS (and Android, desktop browsers) expose the `navigator.mediaSession` API that lets web apps push metadata and action handlers to the OS lock screen / Control Center. Currently unused.

The user wants:
- Lock screen shows "Плейлист Агент" branding when a track is playing
- Track title, artist displayed on lock screen
- Skip forward/backward via lock screen / Control Center
- Play/pause from lock screen

## Goals / Non-Goals

**Goals:**
- Integrate `navigator.mediaSession` into `PlayerProvider` to set metadata (title, artist, album artwork)
- Sync playback state (`playing`, `paused`, `none`) to the OS
- Wire `play`, `pause`, `nexttrack`, `previoustrack` action handlers
- Add a minimal track queue concept to the player context so skip actions have tracks to move between
- Expose `nextTrack` / `previousTrack` on the player API
- Use "Плейлист Агент" as the album placeholder and fallback branding
- Apply a fallback album art SVG (branded) when no cover is available

**Non-Goals:**
- Shuffle or repeat mode
- Playlist-level queue management (no drag-to-reorder, no "up next" UI)
- Cross-session queue persistence
- Platform-specific optimizations beyond Media Session API
- Server-side changes — all integration is client-side

## Decisions

1. **Media Session API in PlayerProvider** — add `useEffect` in `PlayerProvider` that syncs `navigator.mediaSession` whenever `state.track` or `state.status` changes. This keeps media session logic co-located with audio management.

2. **Track queue as ordered track list** — extend `PlayerState` with `queue: PlayerTrackInfo[]` and `queueIndex: number`. On `toggle`, if the track exists in the queue, set `queueIndex` to its position. If not, wrap it in a single-item queue. Supports next/prev navigation trivially.

3. **Exposed `nextTrack` / `previousTrack` on PlayerApi** — both are no-ops when queue has 0-1 items. `nextTrack` increments `queueIndex` (wraps or loops). `previousTrack` decrements. Both call `toggle` internally to trigger playback.

4. **Artwork fallback** — generate a simple branded SVG (text "Плейлист Агент" on dark background) as `data:` URI, used when tracks have no album art. The SVG is inlined in the code to avoid an extra HTTP request.

5. **Set queue from outside** — add `setQueue(tracks: PlayerTrackInfo[], startIndex?: number)` to `PlayerApi`. Screens like `ResultsScreen` call this when the user starts playing a track from a list.

6. **Media Session action registration** — use `navigator.mediaSession.setActionHandler` for `play`, `pause`, `nexttrack`, `previoustrack`. Register once on mount; handlers read current state from refs.

## Risks / Trade-offs

- **Media Session API not available in all Telegram WebView versions** → guard with `'mediaSession' in navigator` check; gracefully degrades to current behavior
- **iOS Safari may not show "next track" button without a valid queue** → ensure `nexttrack` and `previoustrack` handlers are set, and `playbackState` is correctly set to `playing`
- **Queue ownership is implicit** — the last screen that called `setQueue` owns it; switching screens may cause stale queues. Mitigation: clear queue on unmount or when user navigates away from results/profile
- **No cover art from stream** — tracks from yt-dlp streaming don't expose album art URLs. The fallback SVG covers this case.
