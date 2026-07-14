## Why

The current play button is a small icon button inside each track row, making tapping on the row itself a dead zone. Users must precisely hit a ~36px target to play a track. Making the entire row clickable provides a larger tap target, more intuitive interaction, and matches platform conventions (Apple Music, Spotify, YouTube Music).

## What Changes

- **ResultsScreen**: The `.track-row` div becomes clickable — tapping anywhere on the row calls `player.toggle(track)`. The `TrackPlayButton` remains visible as an affordance icon but uses `stopPropagation` to avoid double-fire.
- **ProfileScreen (Downloads)**: Each expanded track `<li>` gets `onClick` to call `player.toggle(track)`. The `CompactPlayButton` is removed since the entire row is now the tappable area.
- **CSS**: `.track-row` gains `cursor: pointer` and a subtle `:hover`/`:active` background to indicate interactivity.

## Capabilities

### New Capabilities

No new capabilities — this is a UX improvement within existing screens.

### Modified Capabilities

No existing specs to modify.

## Impact

- **Files changed**: 3 files in the miniapp (`ResultsScreen.tsx`, `ProfileScreen.tsx`, `glass.css`)
- **No API/backend/server changes**
- **No data model changes**
- **No new dependencies**
