## Context

`miniapp/src/styles/glass.css` already defines the v2 token set (`--lg-v2-*`) and several primitives: `.app-top-bar` (floating pill, currently unused), `.liquid-glass-v2-aurora` (fixed background with `::before`/`::after` orbs + `.liquid-glass-v2-aurora-orb`), `.dock`/`.dock-inner` (currently a full-width bar), `.player-bar` (28px card), and a conic `--liquid-glow` ring that animates via `@keyframes liquid-rotate`. The mockup (`Liquid Glass v2.dc.html`) is the agreed source of truth: purple aurora, pill chrome, theme toggle, centered uppercase prompt hero.

Two concrete gaps block parity today:
1. `@keyframes aurora-a/b/c` are **referenced** by `.liquid-glass-v2-aurora::before/::after/orb` but **do not exist** in the file — the aurora is inert.
2. `App.tsx` renders the legacy `.top-bar` (rectangular, no toggle) and `.player-bar` as a card; `BottomNav` uses the full-width `.dock`.

`data-scheme` is already set on `<html>` by `main.tsx` via `getTelegramWebApp()?.colorScheme ?? "dark"`; all existing CSS keys off `:root[data-scheme=...]`, so a toggle just needs to flip that attribute. All `prefers-reduced-motion`/`prefers-reduced-transparency` guards already exist for the indicator, glow, and aurora opacity.

## Goals / Non-Goals

**Goals:**
- Render the aurora background (add the missing keyframes).
- Floating pill top bar with a working light/dark toggle.
- Centered floating pill dock.
- Pill PlayerBar with spinning circular artwork + glow ring.
- Prompt hero matches the mockup ("ЧТО СЕГОДНЯ НА УМЕ?", no benefits list).
- Results rows + admin tabs aligned to the identity.

**Non-Goals:**
- No change to generation, settings, payments, or any backend behavior.
- No new runtime dependency.
- No change to the PlayerScreen full-screen layout beyond what the capsule implies.

## Decisions

**1. Render the aurora as a sibling of `.app-shell`, not inside it.**
`.app-shell > *` forces `z-index:1; max-width:480px; margin:auto` on direct children, which would shrink/center a fixed full-bleed background. Rendering `<div class="liquid-glass-v2-aurora">…</div>` as a sibling (inside the `ErrorBoundary`, before `<main>`) keeps it `position:fixed; inset:0` full-bleed behind content. The existing `@media (prefers-reduced-transparency: reduce)` rule already drops its opacity to `0.18`.

**2. Theme toggle flips `<html data-scheme>` and persists in `localStorage`.**
Add `scheme` state to `AppInner`, initialized from `getColorScheme()` (Telegram) but overridden by a stored manual choice. `toggleScheme()` flips the value, calls `document.documentElement.setAttribute("data-scheme", next)`, and writes `localStorage["miniapp-scheme"]`. This reuses every existing `:root[data-scheme=...]` rule with zero new theming work. Alternative — reflect only Telegram's scheme and ignore manual toggle — rejected: the mockup explicitly shows a working toggle.

**3. Dock becomes a single centered pill via CSS only.**
`.dock` → transparent full-width fixed wrapper (`display:flex; justify-content:center`), no background/border. `.dock-inner` → the pill (`border-radius:999px`, `box-shadow:var(--lg-v2-shadow-float)`, `width:fit-content`). The existing ref-measured `.dock-indicator` (accent glow) already slides under the active tab, so `BottomNav.tsx` needs no JS change. This matches the mockup's centered pill nav exactly.

**4. PlayerBar pill with spinning circular artwork.**
`.player-bar` → `border-radius:999px`. `.player-bar-thumbnail` → `border-radius:50%` + `animation: spin 4s linear infinite` when playing (reuse existing `.spin` keyframes via a `playing` class). The existing `.player-bar.liquid-glow::before` conic ring stays as the glow while playing. Markup kept as two rows (art+info+play row, then progress+volume row) but inside the pill; the mockup shows a single row, but keeping the seek/volume row preserves functionality and still reads as a pill. Alternative — drop progress/volume from the capsule — rejected: loses seek/volume control.

**5. Prompt hero copy, not a new layout.**
Swap "Создать плейлист" + benefits list for the centered uppercase "ЧТО СЕГОДНЯ НА УМЕ?" using the existing `.prompt-hero h1` styles; remove the benefits `stack`; keep the gradient pill submit (`.glass-button.primary`) and taller textarea. The mockup's prompt card has no benefits list.

**6. Results/admin alignment is CSS-only.**
`.track-row` radius `12px → 18px`; `.track-artwork` `999px → 14px` (rounded square, matching the mockup's `border-radius:14px`). `.admin-tab.active` already uses accent bg/border — confirmed it matches the mockup's active accent-glow tab; no change needed beyond verifying it renders inside `GlassPanel` sections.

## Risks / Trade-offs

- **Aurora perf**: three blurred radial orbs animating — static cost, but heavy on low-end; mitigated by the `prefers-reduced-transparency` opacity drop and the fact that blurs are GPU-composited.
- **Toggle vs Telegram scheme drift**: manual toggle may diverge from Telegram's own theme. Acceptable — user explicit choice wins, stored in `localStorage`.
- **localStorage on first paint**: initial scheme read in `main.tsx` (Telegram) won't see the stored override until React mounts; a one-frame flash is possible. Mitigated by initializing `AppInner` state from the stored value on mount (synchronous read before first paint of content).

## Migration Plan

Pure frontend. Deploy via `bun run build:miniapp` and the existing deploy flow. Rollback: revert the CSS/component commit and rebuild — no data or API migration.

## Open Questions

- None blocking. The "undrawn" admin sections (shop/users/issuance/access/providers/settings/payments/broadcast) already exist in `AdminScreen.tsx` and render inside `GlassPanel` + `.admin-tab` — they inherit the identity; this change only confirms/strengthens that alignment.
