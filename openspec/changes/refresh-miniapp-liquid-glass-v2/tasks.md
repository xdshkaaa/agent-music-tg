## 1. Aurora background

- [x] 1.1 Add `@keyframes aurora-a` (translate/scale drift), `@keyframes aurora-b`, `@keyframes aurora-c` to `miniapp/src/styles/glass.css` so the existing `.liquid-glass-v2-aurora::before/::after/.liquid-glass-v2-aurora-orb` animations resolve.
- [x] 1.2 In `App.tsx`, render `<div className="liquid-glass-v2-aurora" aria-hidden="true"><div className="liquid-glass-v2-aurora-orb" /></div>` as a sibling before `<main className="app-shell">` (inside `ErrorBoundary`) so it is fixed full-bleed behind content.

## 2. Floating pill top bar + theme toggle

- [x] 2.1 In `App.tsx`, replace the `<header className="top-bar">…</header>` with `<header className="app-top-bar">…</header>` keeping the brand ring + title and the credits `.wallet-pill`.
- [x] 2.2 Add a theme-toggle `<button>` in `.app-top-actions` (sun/moon via `@phosphor-icons/react`) wired to a `toggleScheme()` handler and showing the opposite icon.
- [x] 2.3 In `AppInner`, add `scheme` state initialized from stored `localStorage["miniapp-scheme"]` falling back to `getColorScheme()`; `toggleScheme()` updates `document.documentElement` `data-scheme` and persists the choice.
- [x] 2.4 Add `.theme-toggle` button styles (circular, `.liquid-glass-v2-chip` look) to `glass.css`.

## 3. Centered pill dock

- [x] 3.1 Restyle `.dock` in `glass.css` to a transparent fixed centering wrapper (remove background/border-top/blur; keep `fixed`, `bottom`, `z-index`, `display:flex; justify-content:center`).
- [x] 3.2 Restyle `.dock-inner` to a floating pill: `border-radius: var(--lg-v2-radius-pill)`, `width: fit-content`, `box-shadow: var(--lg-v2-shadow-float)`, keep the `.dock-indicator` accent glow.

## 4. Player capsule pill

- [x] 4.1 Restyle `.player-bar` to `border-radius: var(--lg-v2-radius-pill)`; add `.player-bar.playing .player-bar-thumbnail { border-radius:50%; animation: player-spin 4s linear infinite; }` (reuse `--liquid-glow` ring while playing).
- [x] 4.2 Restructure `PlayerBar.tsx` markup into a pill: row 1 = `[thumbnail, TrackPlayButton, player-info]`, row 2 = `[player-progress, VolumeControl]`, keeping `liquid-glow`/`playing` class while playing.

## 5. Prompt hero

- [x] 5.1 In `PromptScreen.tsx`, replace the "Создать плейлист" `<h1>` + benefits `stack` with the centered uppercase "ЧТО СЕГОДНЯ НА УМЕ?" hero (use `.prompt-hero` + `prompt-hero h1` styles) and remove the `BENEFITS` mapping.
- [x] 5.2 Make the textarea taller (e.g. `rows={4}`) to match the mockup's hero proportions.

## 6. Results rows + admin alignment

- [x] 6.1 In `glass.css`, set `.track-row` `border-radius: 18px` and `.track-artwork` `border-radius: 14px` (rounded square) to match the mockup.
- [x] 6.2 Confirm `.admin-tab.active` uses the accent bg/border glow (matches mockup); no markup change required.

## 7. Build & verify

- [x] 7.1 `bun run typecheck` is clean (miniapp scope — no errors in `miniapp/`; remaining `server/` errors are pre-existing and out of scope).
- [x] 7.2 `bun run build:miniapp` succeeds.
