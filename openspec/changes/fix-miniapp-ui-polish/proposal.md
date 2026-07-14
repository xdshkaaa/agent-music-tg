# fix-miniapp-ui-polish

## Why

Screenshots from a real device show visible UI defects in the Mini App: an oversized «Пополнить» button dwarfing the balance block in the profile, the prompt-screen hero title clipping against the card edge with a desktop resize handle on the textarea, admin segmented controls and tab rows hard-clipping at the right edge with no scroll affordance, the bottom-nav active indicator getting out of sync with the highlighted tab, and an unstyled plain-text statistics panel. These make the app look broken to end users.

## What Changes

- **ProfileScreen**: «Пополнить» button no longer stretches to the full height of the balance column; it becomes a normally-sized button aligned with the balance block.
- **PromptScreen**: hero title sized/padded so it never clips at the card edge; textarea gets `resize: none`; vertical layout gains rhythm so the card doesn't leave a large dead zone above the dock.
- **Segmented / admin-tabs**: horizontally scrollable rows get an edge-fade affordance (mask) so clipped items read as scrollable instead of broken.
- **BottomNav**: active-tab color and indicator pill always agree — indicator position recomputed on tab data changes and on font/layout settle, so one tab never shows the highlight while the pill sits under another.
- **Admin StatsPanel**: statistics rendered as labeled stat rows instead of raw paragraphs.

No API, server, or bot changes.

## Capabilities

### New Capabilities

- `miniapp-ui-fixes`: visual-correctness requirements for the five defects above (profile balance row, prompt hero, scrollable control affordance, dock indicator sync, stats presentation).

### Modified Capabilities

_None — existing specs (`component-system`, `screen-refinement`) describe a superseded flat-UI design and no spec-level requirement of the current liquid-glass system changes; these are corrections within the current visual system._

## Impact

- `miniapp/src/screens/ProfileScreen.tsx` — balance row / «Пополнить» button
- `miniapp/src/screens/PromptScreen.tsx` — hero, textarea
- `miniapp/src/screens/AdminScreen.tsx` — StatsPanel markup
- `miniapp/src/components/BottomNav.tsx` — indicator sync
- `miniapp/src/styles/glass.css` — `.glass-input` resize, scroll-fade masks, stat-row classes, profile-stats sizing
- No server, API, or dependency changes; `bun run build:miniapp` only.
