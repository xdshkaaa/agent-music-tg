## Context

`miniapp/src/styles/glass.css` already implements a glass system: `.glass-panel`, `.glass-button`, `.glass-input`, theme-aware via `:root[data-scheme="light|dark"]`, with `backdrop-filter: blur()` and a single flat `--shadow-dark`/`--shadow-light` box-shadow. The user supplied a richer, multi-layer "liquid glass" shadow recipe (`--glass-shadow`, `--glass-shadow-active`, `--glass-shadow-indicator`) plus `.glass`, `.glass-active`, `.glass-indicator` classes.

Surfaces today: `GlassPanel` (all screens), nav tabs + buttons in `App.tsx`, `PromptScreen` input, `ResultsScreen` deep-link/new buttons, `ClarifyScreen` option buttons, and `SettingsScreen` which renders provider/backend as a row of independent `.glass-button.primary` toggles.

Constraint: presentational only. No API/server/bot edits. Must keep `prefers-reduced-motion` and both color schemes working, which the current CSS already honors.

## Goals / Non-Goals

**Goals:**
- Adopt the layered shadow recipe as the resting depth for panels and buttons.
- Add pressed/selected depth (`--glass-shadow-active`).
- Turn SettingsScreen pickers into a real segmented control with a sliding `--glass-shadow-indicator`.
- Keep it legible in light and dark; keep reduced-motion honored.

**Non-Goals:**
- No change to generation, settings, or auth behavior.
- No new fonts, colors, or accent changes beyond what the effect needs.
- No new runtime dependency (pure CSS + a small React component).

## Decisions

**1. Merge the supplied tokens into the existing token block, don't fork.**
Add `--glass-shadow*` alongside the current variables in the same `:root`. Rework `.glass-panel` and `.glass-button` resting `box-shadow` to reference `--glass-shadow`. Keep `backdrop-filter` blur (the recipe is shadows only — blur is what makes it read as glass). Alternative — ship the user's `.glass/.glass-active/.glass-indicator` as standalone add-on classes and hand-add them per element — rejected: leaves two competing shadow systems and duplicate maintenance. Composing the token into the classes that already exist is cleaner.

**2. Light-scheme variant is required, not optional.**
The pasted stack is dark-tuned (white inset highlights over dark). On a light gradient those highlights vanish and the black insets look dirty. Define a `:root[data-scheme="light"]` override of `--glass-shadow`/`--glass-shadow-active`/`--glass-shadow-indicator` with reduced-opacity highlights and softer occlusion. This mirrors how `--shadow-light` already shadows `--shadow-dark`.

**3. Segmented control as a small reusable component.**
Add `miniapp/src/components/Segmented.tsx`: a glass track (`.glass`) containing option buttons and one absolutely-positioned `.glass-indicator` slider whose `transform: translateX()` / width is driven by the active index. Position via CSS (equal-width options, `left: calc(index * 100% / n)`), so no measurement/JS layout needed. SettingsScreen swaps its two `.row.wrap` button groups for `<Segmented>`. Alternative — keep the button row and just restyle active with `.glass-active` — rejected: the indicator token exists specifically for a segmented control and gives the intended premium feel; the user asked for the full effect.

**4. Indicator animation gated on reduced-motion.**
Indicator uses `transition: transform 0.25s` under `@media (prefers-reduced-motion: no-preference)` only; the existing global reduced-motion rule already clamps transition durations, so the slide degrades to an instant jump automatically.

## Risks / Trade-offs

- **Layered insets can look muddy on light backgrounds** → dedicated light-scheme token override; verify visually in Telegram light theme, not just devtools.
- **Segmented equal-width assumption breaks with long option labels** (provider/backend ids vary in length) → allow the track to size options by content with the indicator measuring the active button's offset/width via `ref` if CSS-only equal-width truncates ids; start CSS-only, fall back to ref-measured only if labels overflow.
- **Double shadow systems during transition** → do the token merge and class rework in one pass so no element carries both `--shadow-*` and `--glass-shadow`.
- **Backdrop-filter + heavy multi-layer shadow on low-end devices** → effect is static (no per-frame repaint except the short indicator slide), so cost is negligible; no mitigation needed.

## Migration Plan

Pure frontend. Deploy: `bun run build:miniapp`, ship `miniapp/dist` per existing deploy flow. Rollback: revert the CSS/component commit and rebuild — no data or API migration involved.

## Open Questions

- Should nav tabs in `App.tsx` also become a segmented control (single indicator across Prompt/Settings), or just gain `.glass-active` on the current tab? Leaning: give nav the active treatment now, full segmented nav optional later.
