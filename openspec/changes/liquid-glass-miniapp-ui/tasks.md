## 1. Depth tokens

- [x] 1.1 Add `--glass-shadow`, `--glass-shadow-active`, `--glass-shadow-indicator` to the `:root` block in `miniapp/src/styles/glass.css` (dark-tuned values from the proposal)
- [x] 1.2 Add `:root[data-scheme="light"]` overrides for all three tokens (reduced-opacity highlights, softer occlusion) so the effect holds in Telegram light theme
- [x] 1.3 Add reusable `.glass`, `.glass-active`, `.glass-indicator` classes bound to those tokens

## 2. Apply to existing surfaces

- [x] 2.1 Rework `.glass-panel` resting `box-shadow` to use `--glass-shadow` (keep `backdrop-filter` blur); remove reliance on `--shadow-dark`/`--shadow-light`
- [x] 2.2 Rework `.glass-button` resting shadow to `--glass-shadow`; switch `:active` to apply `--glass-shadow-active` alongside the existing scale
- [x] 2.3 Verify `.glass-input`, `.track-row`, and nav buttons still read correctly against the new panel depth; adjust borders/highlights if they clash

## 3. Segmented control

- [x] 3.1 Create `miniapp/src/components/Segmented.tsx` — glass `.glass` track, option buttons, one absolutely-positioned `.glass-indicator` slider positioned by active index
- [x] 3.2 Gate the indicator slide transition behind `@media (prefers-reduced-motion: no-preference)`
- [x] 3.3 Replace the two `.row.wrap` button groups in `SettingsScreen.tsx` with `<Segmented>` for provider and backend, wiring selection to `setActiveProvider`/`setActiveBackend`
- [x] 3.4 Handle long/variable option ids (provider/backend names): confirm CSS equal-width works, else measure active button offset/width via ref

## 4. Nav active state

- [x] 4.1 Apply `.glass-active` to the current nav tab in `App.tsx` so the active screen is visually marked

## 5. Verify

- [x] 5.1 `bun run build:miniapp` succeeds; `bun run typecheck` clean
- [ ] 5.2 Visual check in Telegram Mini App — dark and light themes: panels, buttons pressed state, segmented indicator, nav active tab
- [ ] 5.3 Confirm reduced-motion: indicator jumps without sliding
