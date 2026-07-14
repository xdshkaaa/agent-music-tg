## Why

The Mini App already uses a glass aesthetic, but its surfaces rely on a single flat `box-shadow` (`--shadow-dark` / `--shadow-light`) that reads as a generic blurred panel rather than true "liquid glass." A layered multi-inset shadow system gives depth, a lit top edge, and a pressed/active state — the polished Apple-style look — and adds a segmented-switch indicator treatment the current UI lacks.

## What Changes

- Introduce three layered glass shadow tokens — `--glass-shadow` (resting surface), `--glass-shadow-active` (pressed/selected), `--glass-shadow-indicator` (segmented-control slider) — as the shared depth language.
- Replace the flat panel/button shadows with the layered `--glass-shadow`, applied via reusable `.glass`, `.glass-active`, `.glass-indicator` classes composed onto existing components.
- Convert the SettingsScreen provider/backend pickers from a row of independent `primary` buttons into a proper **segmented control** with a sliding `.glass-indicator` marking the active option.
- Apply pressed-state feedback (`.glass-active`) on button/tab press instead of the current scale-only `:active`.
- Keep the design **theme-aware**: the pasted tokens are dark-tuned, so derive a light-scheme variant so the effect holds in Telegram's light theme.
- Respect `prefers-reduced-motion` for the new indicator slide.

## Capabilities

### New Capabilities
- `miniapp-liquid-glass`: The Mini App's liquid-glass visual system — layered depth tokens, the surfaces they apply to (panels, buttons, inputs, nav tabs), the segmented-control indicator behavior, and its light/dark and reduced-motion requirements.

### Modified Capabilities
<!-- none — no existing specs define Mini App visuals -->

## Impact

- **CSS**: `miniapp/src/styles/glass.css` — add tokens + `.glass*` classes; rework `.glass-panel`, `.glass-button`, `.glass-input` shadows.
- **Components**: `miniapp/src/screens/SettingsScreen.tsx` (segmented control), possibly a small `Segmented` component in `miniapp/src/components/`. Nav in `App.tsx` gains active-tab indicator.
- **No API, server, or bot changes.** Purely presentational; behavior of generation/settings endpoints untouched.
- **Build**: verified via `bun run build:miniapp` + visual check in Telegram (light & dark).
