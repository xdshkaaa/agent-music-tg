## 1. Player context — expose currentTime and duration

- [x] 1.1 Add `currentTime: number` and `duration: number` to `PlayerState` in `player.tsx`
- [x] 1.2 Wire `timeupdate` listener to update `currentTime` and `duration` from `audio.currentTime` / `audio.duration`
- [x] 1.3 Add `loadedmetadata` / `durationchange` listener to set `duration` when metadata loads
- [x] 1.4 Reset `currentTime` and `duration` on track change (src set)

## 2. PlayerBar — two-row layout

- [x] 2.1 Restructure `.player-bar` from single `display: flex` row to `flex-direction: column` with two `.player-bar-row` children
- [x] 2.2 First row: `TrackPlayButton` + `.player-info` (flex: 1, same as current)
- [x] 2.3 Second row: `.player-progress` (flex: 1) + `VolumeControl` (fixed width, existing component)
- [x] 2.4 Change `.player-progress` from `flex: 0 0 72px` to `flex: 1` so it fills available width
- [x] 2.5 Add optional hairline divider between rows (`.player-bar-divider`)
- [x] 2.6 Verify volume slider hides on `< 360px` viewport (already has the media query, check it still works)

## 3. PlayerScreen — time labels on progress bar

- [x] 3.1 Create `formatTime(seconds: number): string` helper (mm:ss) inside PlayerScreen or as utility
- [x] 3.2 Add two `<span>` elements around `.player-screen-progress`: left for current time, right for duration
- [x] 3.3 Bind spans to `player.currentTime` and `player.duration` (formatted)
- [x] 3.4 Hide time labels when `duration === 0` (track loading state)

## 4. PlayerScreen — grouped controls panel

- [x] 4.1 Wrap play button and `VolumeControl` in a `.player-screen-controls` container (visually grouped card)
- [x] 4.2 Reduce play button from 72×72px to 56×56px; update `.player-screen-play-btn` styles
- [x] 4.3 Place `VolumeControl` below the play button inside the controls card (vertical layout)
- [x] 4.4 Adjust gaps: Header→Artwork=8px, Artwork→Info=12px, Info→Progress=8px, Progress→Controls=16px
- [x] 4.5 Remove now-unnecessary spacer `<div style={{ width: 36 }} />` in header if still present

## 5. CSS — player layout styles

- [x] 5.1 Update `.player-bar` styles for column layout; add `.player-bar-row` and `.player-bar-divider` classes
- [x] 5.2 Update `.player-progress` to flex: 1; adjust height if needed for two-row compactness
- [x] 5.3 Update `.player-screen-controls` to be a visually grouped block (optional subtle background/border)
- [x] 5.4 Add `.player-screen-time` styles for time labels (font, size, colour)
- [x] 5.5 Verify all dark/light scheme overrides are in place
- [x] 5.6 Verify the `< 360px` media query still hides volume slider in the new two-row layout

## 6. Verify

- [x] 6.1 Build miniapp with `bun run build:miniapp` — no errors in changed files (pre-existing App.tsx unused-import errors remain)
- [x] 6.2 Open player in Telegram WebView, verify PlayerBar two-row layout on short and long track titles
- [x] 6.3 Open PlayerScreen, verify time labels, grouped controls, play/pause toggle
- [x] 6.4 Test narrow viewport (< 360px): volume slider hidden in bar, playable in screen
- [x] 6.5 Test mute toggle and volume slider still work
