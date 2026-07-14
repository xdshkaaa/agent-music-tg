## 1. Player state & API

- [x] 1.1 Add `volume` (number, default 0.7) and `muted` (boolean, default false) to `PlayerState` in `player.tsx`
- [x] 1.2 Add `prevVolumeRef` (useRef) to store volume before mute for restore
- [x] 1.3 Add `setVolume(v: number)` to `PlayerApi` — set `audio.volume`, update state, persist to `localStorage` (try/catch)
- [x] 1.4 Add `toggleMute()` to `PlayerApi` — toggle `muted`, store/restore volume via `prevVolumeRef`
- [x] 1.5 Add `useEffect` on mount to restore volume from `localStorage` (default 0.7 if absent), wrapped in try/catch

## 2. PlayerBar UI

- [x] 2.1 Import `SpeakerHigh`, `SpeakerLow`, `SpeakerX` from `@phosphor-icons/react`
- [x] 2.2 Add volume control row inside `PlayerBar` after `player-info`, before `player-progress`: icon button + `<input type="range">`
- [x] 2.3 Implement icon selection: muted → `SpeakerX`, volume > 0.5 → `SpeakerHigh`, else → `SpeakerLow`; click calls `toggleMute()`
- [x] 2.4 Bind range input: `min=0 max=1 step=0.05 value={player.volume}`; `onChange` calls `player.setVolume(parseFloat(e.target.value))`
- [x] 2.5 Verify existing progress bar layout still works with new volume control

## 3. CSS styling

- [x] 3.1 Style volume range input in `glass.css`: `-webkit-appearance: none`, custom track (4px height, `--hairline` bg, `--accent` fill), custom thumb (12px circle, `--accent`)
- [x] 3.2 Add `.volume-control` container flex layout: icon (flex-shrink 0) + range (flex-grow)
- [x] 3.3 Add media query for narrow viewports (< 360px): hide range input, keep icon only
- [x] 3.4 Ensure touch target size: range track padded to at least 32px height

## 4. Verify

- [x] 4.1 Run `bun run build` (or appropriate build command) in `miniapp/` — no type errors
- [ ] 4.2 Smoke test: play a track, adjust volume slider, verify audio level changes
- [ ] 4.3 Smoke test: click speaker icon to mute/unmute, verify icon changes and correct volume restoration
- [ ] 4.4 Smoke test: refresh the page, verify volume level restored from localStorage
