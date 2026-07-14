## Why

Current miniapp UI uses glassmorphism, vivid purple accent, Inter font, and pervasive emoji — violating the Premium Utilitarian Minimalism protocol. The UI needs a flat, warm monochrome foundation with muted pastel accents, proper typography, and icon-only semantics.

## What Changes

- **BREAKING**: Remove all glassmorphism (`backdrop-filter`, layered inset shadows, glass highlights)
- Replace color palette: `#a855f7` accent → muted pastels (`#1F6C9F`, `#346538`, `#9F2F2D`), `#0a0a0b` → warm off-white/bone, `#232326` hairline → `#EAEAEA`
- Replace `Inter Tight` with system-native `SF Pro Display` / `Geist Sans` stack
- Replace all emoji in `.tsx` files with Phosphor icons (Bold/Fill weight)
- Reduce `border-radius`: cards max `12px`, buttons `4-6px`, remove `999px` from dock/containers
- Eliminate heavy shadows; use ultra-diffuse `opacity < 0.05` where needed
- Extract repetitive inline styles into CSS utility/component classes

## Capabilities

### New Capabilities
- `visual-foundation`: CSS custom properties, color palette, typography, shadow tokens, motion for the warm monochrome flat system
- `component-system`: Flat replacement for glass-panel, glass-button, glass-input, dock, segmented control, action buttons
- `emoji-migration`: Replace all emoji in every `.tsx` screen/component with Phosphor icons (Bold/Fill weight)
- `screen-refinement`: Extract inline styles to CSS classes in BuyScreen, ProfileScreen, AdminScreen; structural cleanup

### Modified Capabilities

*(none — no existing specs)*

## Impact

- `miniapp/src/styles/glass.css` — full rewrite
- `miniapp/src/components/*.tsx` — GlassPanel, PlayerBar, Segmented, AdminSettingsBar, IconOrEmoji
- `miniapp/src/screens/*.tsx` — all 7 screens (emoji replacement + style extraction)
- `miniapp/index.html` — remove Inter Tight font preload/load
- `miniapp/package.json` — no new deps needed (Phosphor already installed)
