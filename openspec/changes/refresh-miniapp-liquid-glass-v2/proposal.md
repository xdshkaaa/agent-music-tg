## Why

The `Liquid Glass v2.dc.html` mockup is the agreed visual source of truth: a **purple `#a855f7` aurora liquid-glass** identity with floating pill chrome (top bar, dock, player capsule), a light/dark theme toggle, and a centered uppercase prompt hero. Today `miniapp/src/styles/glass.css` already imports the `--lg-v2-*` tokens and several `liquid-glass-v2-*` primitives, but `App.tsx` and the components still render the **older chrome**: a rectangular top bar (`.top-bar`) with no theme toggle, a full-width dock bar, a 28px-radius player card, and a "Создать плейлист" + benefits hero. Several screens (admin sub-tabs, clarify/results rows) also diverge from the identity.

This change closes that gap so the shipped Mini App matches the rendered v2 mockup, including the undrawn interface areas adapted to the same identity.

## What Changes

- Add the missing `@keyframes aurora-a/b/c` and render a fixed **aurora** background (`liquid-glass-v2-aurora` + orb) behind the app shell, suppressed under `prefers-reduced-transparency`.
- Replace the rectangular `.top-bar` with the existing floating **pill `.app-top-bar`** and add a **theme toggle** button (sun/moon) that flips `data-scheme` on `<html>` and persists the choice.
- Convert the full-width dock into a **single centered floating pill** (`.dock-inner` rounded `999px` with the existing accent-glow active indicator); `.dock` becomes a transparent centering wrapper.
- Restyle the global **PlayerBar into a pill** with a circular, spinning artwork and the existing conic liquid-glow ring while playing.
- Restyle the **Prompt hero** to the centered uppercase "ЧТО СЕГОДНЯ НА УМЕ?" with a taller textarea and the gradient pill submit (dropping the benefits list, matching the mockup).
- Align **Results track rows** and **admin sub-tabs** to the identity (rounded-square art, 18px rows; accent-glow active tabs).
- Keep everything **theme-aware** (both schemes) and **reduced-motion**-safe (aurora, indicator slide, glow already gated).

## Capabilities

### New Capabilities
- `miniapp-theme-toggle`: The Mini App's light/dark scheme toggle — a control in the top bar that flips `data-scheme` on `<html>`, reflects the current scheme with a sun/moon icon, and persists the user's choice.

### Modified Capabilities
- `glass-header`: The Mini App top bar becomes a floating pill (not a rectangular sticky bar) and gains a theme-toggle control.
- `persistent-bottom-nav`: The bottom dock becomes a single centered floating pill rather than a full-width bar.
- `player-screen`: The global PlayerBar becomes a pill with circular spinning artwork and a conic glow ring while playing.

## Impact

- **CSS**: `miniapp/src/styles/glass.css` — add aurora keyframes; restyle `.dock` / `.dock-inner`, `.player-bar` / player-bar children, `.track-row` / `.track-artwork`; add theme-toggle button styles.
- **Components**: `App.tsx` (pill top bar + theme toggle + scheme state + aurora layer), `BottomNav.tsx` (no JS change needed — CSS-only pill), `PlayerBar.tsx` (pill markup), `PromptScreen.tsx` (hero copy + markup), `AdminScreen.tsx` (active-tab accent glow confirmed/aligned).
- **No API, server, or bot changes.** Purely presentational; generation/settings/payment behavior untouched.
- **Build**: verified via `bun run build:miniapp` + `bun run typecheck`.
