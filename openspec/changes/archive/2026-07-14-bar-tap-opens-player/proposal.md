## Why

The PlayerBar shows the currently playing track but tapping it does nothing. Users expect tapping the bar to open a full-player screen with artwork, progress, volume control, and playback controls — standard mobile player UX.

## What Changes

- PlayerBar becomes tappable: tapping navigates to a full-player screen
- New full-player screen (`PlayerScreen`) with rich layout: artwork area, progress slider, volume slider, mute toggle, play/pause
- PlayerBar retains its current compact layout but gets an `onClick` handler
- Routing update to support `/player` route
- No changes to the audio engine or PlayerProvider API

## Capabilities

### New Capabilities
- `player-screen`: Full-screen player with artwork placeholder, seekbar, volume control, mute toggle, play/pause

### Modified Capabilities

None — no existing specs to modify.

## Impact

- `miniapp/src/components/PlayerBar.tsx` — add `onClick` that navigates to `/player`
- New file: `miniapp/src/screens/PlayerScreen.tsx` — full-player screen component
- `miniapp/src/App.tsx` — add `/player` route
- `miniapp/src/styles/glass.css` — add player screen styles
- No API/server changes needed; no dependency changes
