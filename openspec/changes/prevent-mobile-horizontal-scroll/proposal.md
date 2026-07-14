## Why

On mobile, the UI allows horizontal swiping/scrolling in areas where only vertical scroll is intended. This creates a broken, janky feel — users can nudge the page sideways, revealing empty space or clipped content behind the viewport.

## What Changes

- Add `overflow-x: hidden` and `overscroll-behavior-x: none` at the root layout level to lock horizontal scroll
- Audit all screen components and the app shell for content that overflows the viewport width
- Fix any elements that cause unintended horizontal overflow (wide absolute-positioned elements, negative margins, unconstrained flex children)
- Preserve intentional horizontal scroll on `.segmented`, `.admin-tabs`, and `.category-pills`

## Capabilities

### New Capabilities
- `horizontal-scroll-guard`: Root-level CSS protections and component audits that prevent unintended horizontal scroll while preserving intentional scrollable regions.

### Modified Capabilities

None — no existing specs to modify.

## Impact

- `miniapp/src/styles/glass.css` — add root-level overflow/overscroll rules
- `miniapp/src/App.tsx` — may need wrapper or layout adjustments
- `miniapp/src/screens/*.tsx` — audit each screen for overflow culprits
- `miniapp/src/components/GlassPanel.tsx` — audit for overflow issues
