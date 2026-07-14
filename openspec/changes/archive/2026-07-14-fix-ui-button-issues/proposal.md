## Why

The download history card buttons in the Profile screen have uniform visual weight, oversized touch targets, and inconsistent iconography, causing visual noise that obscures content hierarchy. This makes the UI feel cluttered and increases risk of accidental destructive actions.

## What Changes

- **Reduce and differentiate action button sizes** — shrink social buttons (repeat, delete, expand) from 44×44px (`.icon-btn`) to ~40×40px; differentiate visual weight
- **Make delete destructive** — add visual distinction for the delete button (red hover/active state) to signal danger
- **Reduce collapse/expand prominence** — move chevron to card edge, use smaller icon without button container
- **Reduce track play button size** — shrink play buttons in download history track list to match existing `CompactPlayButton` size (28×28px)
- **Normalize icon weights** — use consistent Phosphor icon weight (regular) across all buttons
- **Soft button surfaces** — replace solid white button backgrounds with glass-matching dark surfaces; use semi-transparent backgrounds instead of opaque white
- **Add proper button states** — implement hover, active, disabled, and loading visual states in CSS
- **Group card actions logically** — visually separate destructive actions from safe actions; add spacing/groups
- **Add delete confirmation** — show a confirmation step before deleting a download record
- **Add tooltip to warning icons** — attach tooltip to ⚠️ warning indicators on failed tracks
- **Improve visual spacing** — increase gaps between action buttons, separate title area from actions

## Capabilities

### New Capabilities

- `ui-button-system`: Unified button component system with size variants (sm/md/lg), semantic color variants (default/destructive), and interaction states (hover/active/disabled/loading)

### Modified Capabilities

- *(no existing spec-level behavior changes — purely UI/UX improvements)*

## Impact

- `miniapp/src/styles/glass.css` — rewrite `.icon-btn` styles with reduced size, semantic variants, hover/active/disabled states
- `miniapp/src/screens/ProfileScreen.tsx` — restructure `DownloadEntry` layout: reorder/group action buttons, add delete confirmation, add tooltip component, adopt new button sizes
- `miniapp/src/components/PlayerBar.tsx` — no changes (ResultsScreen play buttons are fine)
- No backend API changes
- No new dependencies
