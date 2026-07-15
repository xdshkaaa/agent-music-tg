# fix-miniapp-ui-polish — Design

## Context

The Mini App uses a liquid-glass design system (`miniapp/src/styles/glass.css`) with React screens. Device screenshots show five defects. Root causes located:

1. **Profile «Пополнить»** — `ProfileScreen.tsx:301-302` sets `alignSelf: "stretch"` + `height: "auto"` on the button inside `.profile-stats` (a flex row with `align-items: stretch`), so the button balloons to the full height of the 4-row balance column.
2. **Prompt hero clipping / dead space** — `h1` uses `line-height: 1.1` with uppercase transform inside `.glass-panel { overflow: hidden; padding: 24px }`; combined with the reveal `translateY` animation, ascenders can clip against the mask. Below the card the shell leaves a large empty region.
3. **Textarea resize grip** — `.glass-input` has no `resize` rule; `<textarea className="glass-input">` shows the desktop resize handle.
4. **Admin horizontal clipping** — `.segmented` and `.admin-tabs` are `overflow-x: auto` with hidden scrollbars; items get hard-cut at the container edge («op…», «Пользовате…») with nothing indicating scrollability.
5. **Dock indicator desync** — `BottomNav.tsx` positions `.dock-indicator` imperatively from `getBoundingClientRect()`. The accent color (`.dock-tab.active`) applies instantly while the pill morphs over 0.35 s; recompute also races font load and the async appearance of the «Админ» tab.
6. **StatsPanel** — three bare `<p>` elements, visually unfinished.

## Goals / Non-Goals

**Goals:**
- Fix the five visual defects within the existing glass design system.
- Pure client-side changes; no API/server/bot edits.

**Non-Goals:**
- No redesign of the visual system, colors, or navigation structure.
- No changes to superseded flat-UI specs (`component-system`, `screen-refinement`).
- No new dependencies.

## Decisions

### D1. Profile button: fixed-height, self-centered
Replace `alignSelf: "stretch", height: "auto"` with `alignSelf: "center"` and standard button padding; move the inline style into a `.profile-topup-btn` class (repo convention: extract repeated inline styles to glass.css). Alternative considered — keep stretch but cap `max-height`: rejected, centered standard button is the conventional pattern and reads better next to a tall text column.

### D2. Prompt hero: clamp size + padding guard
Use `font-size: clamp(22px, 7vw, 26px)` and `line-height: 1.15` on the hero title (scoped `.prompt-hero h1`), keeping panel `overflow: hidden` (needed for the `::before` highlight). Alternative — remove `overflow: hidden`: rejected, breaks the glass highlight mask. Dead space: no artificial filler; tighten card spacing only (dead zone is inherent to short content + fixed dock and acceptable once the card is balanced).

### D3. Textarea: `resize: none` on `textarea.glass-input`
One CSS rule. No auto-grow (out of scope).

### D4. Scroll affordance: CSS `scroll-timeline`-free mask via wrapper + JS class toggle
Add a shared `.scroll-fade` treatment: container gets `mask-image: linear-gradient(...)` on the overflowing side. Since a pure-CSS solution that reacts to scroll position needs `animation-timeline: scroll()` (unsupported in older Telegram WebViews), use a tiny shared hook `useScrollFade(ref)` that toggles `data-fade-left/right` attributes on `scroll` + `ResizeObserver`, with CSS masks keyed off those attributes. Applied to `.segmented` (Segmented component) and `.admin-tabs`. Alternative — static permanent fade: rejected, fade over the last visible item at scroll end looks broken too.

### D5. Dock indicator: keep imperative positioning, fix the triggers
Recompute on: tab change (existing), `ResizeObserver` on the inner container (existing), plus `document.fonts.ready` and after the tabs array length changes (admin tab appears — already covered by `tabs` in deps, but refs array must be trimmed to `tabs.length` to avoid stale refs when tab set shrinks). Also delay the accent color switch is *not* needed — pill morph + instant color is fine as long as geometry is correct; the screenshot bug is stale geometry, not the animation. Alternative — pure CSS `:has()`/anchor positioning: rejected, WebView support uncertain.

### D6. StatsPanel: label/value rows
Markup: `.stat-row` (flex, space-between) with `.text-muted` label and bold `tabular-nums` value. Reuses existing type styles; ~10 lines of CSS.

### D7. Progress bars inside glass cards: never touch the rounded, clipped bottom edge
Glass containers clip their content: `.glass-surface { border-radius: var(--lg-v2-radius-panel); overflow: hidden }` (`glass.css:241-246`) and `.player-bar` (`:1532`, `overflow: hidden` unless `.liquid-glow`). A progress bar (or any rounded/glowing element) laid flush against the bottom inside such a container gets its lower edge sliced by the corner radius, producing the illusion that the bar sits *under* the card. Rule, to bake into any new card that carries a progress bar (e.g. a redesigned player/queue card):

- **A — keep clipping, add breathing room:** keep `overflow: hidden` on the card; push the bar ≥12px from the bottom so it never enters the radius arc. Use when the bar has no outer glow.
- **B — don't clip the bar:** place the bar in an inner wrapper that the card does *not* clip (`overflow: visible`), so a glowing/rounded bar can sit near the edge without being sliced. This is the established pattern — `.player-bar.liquid-glow` already does `overflow: visible` (`glass.css:1577`). Use when the bar carries the liquid glow.

Current code is safe: `.player-progress`/`.player-screen-progress` live mid-card (`glass.css:1898-1904`, `player-bar` row after a divider) and `.player-progress` itself only uses `overflow: hidden` to clip its own fill (`glass.css:1946`), which is correct. This decision is a guardrail for future cards, not a fix to existing components.

## Risks / Trade-offs

- [Mask + backdrop-filter interaction] `mask-image` on `.segmented` could clip its own blur backdrop → apply the mask to a wrapper or to the scrolling content, verify visually in Telegram WebView.
- [Old WebViews without `ResizeObserver`/`document.fonts`] guard with feature checks; degrade to current behavior.
- [Reveal animation clipping] if clamp doesn't fully cure clipping, fallback is extra top padding inside `.prompt-hero` — verify on device after build.

## Migration Plan

Frontend-only: `bun run typecheck`, `cd miniapp && bun run build`, deploy via `./deploy/deploy.sh`. Rollback = previous release symlink (existing mechanism).

## Open Questions

None blocking.
