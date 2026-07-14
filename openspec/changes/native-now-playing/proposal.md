## Why

The Mini App's in-browser audio player has no integration with the device's lock screen or Control Center. When a user plays a track, the lock screen shows a generic "Плейлист Агент" placeholder with no track info, artist name, or playback controls. Users on iOS (and other platforms) cannot see what's playing, skip tracks, or pause/resume without re-entering the app.

## What Changes

- Integrate Media Session API (`navigator.mediaSession`) into the player context to expose track metadata (title, artist, album art) to the OS
- Wire "next track" and "previous track" action handlers for skip support from the lock screen / Control Center
- Set a branded "Плейлист Агент" fallback placeholder while idle
- Track the current playback position and status through Media Session so the OS control center reflects accurate state

## Capabilities

### New Capabilities
- `native-now-playing`: Lock screen / Control Center integration for the Mini App's audio player — metadata display, playback state sync, and skip actions via the Media Session API

### Modified Capabilities

None — no existing spec changes.

## Impact

- **miniapp/src/lib/player.tsx**: Add Media Session API integration (metadata, playback state, action handlers)
- **miniapp/src/components/PlayerBar.tsx**: May need a "next track" button source — the `toggle()` API needs a queue or a way to pass next/prev tracks
- **ResultsScreen.tsx / ProfileScreen.tsx**: May need minor changes to expose a track queue or list context for skip navigation
