## 1. CSS Tokens & Keyframes

- [x] 1.1 Add `--liquid-glow`, `--liquid-border-gradient`, `--liquid-morph-duration`, `--liquid-morph-easing` CSS variables to `:root` in glass.css
- [x] 1.2 Add light-scheme overrides for new liquid-glass tokens
- [x] 1.3 Add `@property --angle` for conic-gradient animation
- [x] 1.4 Add `@keyframes liquid-rotate` (gradient spin) and `@keyframes liquid-pulse` (glow pulse)
- [x] 1.5 Add `@media (prefers-reduced-motion: reduce)` disable rules for liquid animations

## 2. BottomNav — Liquid Dock & Animated Indicator

- [x] 2.1 Replace `.dock` solid background with transparent glass (`backdrop-filter`, alpha bg)
- [x] 2.2 Add `.dock-indicator` CSS (absolute positioned pill, morphing transition)
- [x] 2.3 Add JS indicator logic in BottomNav.tsx: refs array per tab button, `useEffect` to position indicator on active tab change
- [x] 2.4 Add `dock-indicator` element to BottomNav JSX between `dock-inner` and tab buttons
- [x] 2.5 Remove `.dock-tab.active` background color, keep only text color

## 3. PlayerBar — Liquid Glow & Gradient Border

- [x] 3.1 Add `.player-bar.glowing` CSS class with `--liquid-border-gradient` pseudo-element
- [x] 3.2 Add `--liquid-glow` box-shadow to PlayerBar
- [x] 3.3 Add `.player-bar.glowing` class toggle in PlayerBar.tsx when track is active
- [x] 3.4 Ensure glow pauses with `prefers-reduced-motion`

## 4. AdminSettingsBar — Visual Alignment

- [x] 4.1 Update `.admin-settings-bar` border-radius to match dock-inner
- [x] 4.2 Sync glass background opacity and backdrop-filter with new dock tokens

## 5. Verification

- [x] 5.1 Run `bun run typecheck` — no type errors
- [x] 5.2 Run `bun run dev` — visual check: dock glass, indicator morphing, player glow
- [x] 5.3 Test in Telegram Mini App environment
