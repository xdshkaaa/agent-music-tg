## 1. Player State Extensions

- [x] 1.1 Add `queue: PlayerTrackInfo[]` and `queueIndex: number` to `PlayerState` interface in `miniapp/src/lib/player.tsx`
- [x] 1.2 Add `nextTrack: () => void`, `previousTrack: () => void`, and `setQueue: (tracks: PlayerTrackInfo[]) => void` to `PlayerApi` interface
- [x] 1.3 Implement `nextTrack` / `previousTrack` — navigate queue index, call `toggle` internally; no-op on single-track queue
- [x] 1.4 Implement `setQueue` — store tracks; `toggle` finds track in queue and plays
- [x] 1.5 Handle queue edge case: if `queue` has a different track than `track.uri`, the next/prev should still work relative to queue

## 2. Media Session API Integration

- [x] 2.1 Add `useEffect` in `PlayerProvider` that syncs `navigator.mediaSession.metadata` whenever `state.track` changes — title, artist, album ("Плейлист Агент"), artwork fallback SVG
- [x] 2.2 Add `useEffect` that syncs `navigator.mediaSession.playbackState` whenever `state.status` changes (`"playing"` / `"paused"` / `"none"`)
- [x] 2.3 Register `play`, `pause`, `nexttrack`, `previoustrack` action handlers via `navigator.mediaSession.setActionHandler` on mount
- [x] 2.4 Create branded fallback SVG artwork (`data:` URI) for tracks without cover art — "Плейлист Агент" on dark background
- [x] 2.5 Guard all Media Session calls with `'mediaSession' in navigator` check

## 3. Screen Wiring

- [x] 3.1 In `ResultsScreen` — when user taps play on a track, call `player.setQueue(playlist.tracks)` to set the full playlist as queue
- [x] 3.2 In `ProfileScreen` `DownloadEntry` — when user taps compact play on a track, call `player.setQueue(record.tracks)` (convert `DownloadTrack` to `PlayerTrackInfo`)
- [ ] 3.3 Optional: clear queue when navigating away from ResultsScreen / ProfileScreen (pass `onUnmount` or use cleanup)

## 4. Verification

- [ ] 4.1 Run `bun run --watch` and test playback in Mini App
- [ ] 4.2 Verify lock screen shows "Плейлист Агент" with track title and artist on iOS/desktop
- [ ] 4.3 Verify next/previous track from lock screen navigates the queue
- [ ] 4.4 Verify play/pause from lock screen toggles playback
- [ ] 4.5 Verify graceful degradation when Media Session API is unavailable
