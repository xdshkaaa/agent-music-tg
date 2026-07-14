## Context

Current bottom dock in `miniapp/src/App.tsx` uses `position: sticky; bottom: 8px;` inside `.app-shell`. Because `.app-shell` is a flex column with `min-height: 100dvh`, when content overflows the viewport the dock scrolls off-screen — it is not always visible. The dock markup is also inlined directly in `App.tsx`, mixing navigation structure with screen routing.

## Goals / Non-Goals

**Goals:**
- Dock always visible at bottom of viewport (position: fixed)
- Abstract dock markup into a reusable `BottomNav` component
- Ensure no content is hidden behind the fixed bar
- Maintain current visual design, tabs, icons, and behavior
- Preserve PlayerBar positioning

**Non-Goals:**
- Adding or removing navigation tabs
- Changing visual style, colors, or animations
- Changing the top bar or header
- Changing the PlayerScreen overlay behavior

## Decisions

1. **position: fixed over position: sticky**
   - `sticky` scrolls within the parent container; `fixed` pins to viewport regardless of scroll
   - Requires adding bottom padding to `.app-shell` so content is not obscured

2. **Extract `<BottomNav>` component**
   - Keeps `App.tsx` focused on screen routing and state
   - Navigation tabs, active-tab detection, and styling are self-contained
   - Easier to test and modify in isolation

3. **Bottom padding via CSS custom property**
   - Use a CSS variable for the dock height so it stays in sync
   - `.app-shell` gets `padding-bottom: calc(40px + var(--dock-height))`

4. **PlayerBar adjustment**
   - PlayerBar currently uses `position: sticky; bottom: 76px` (above dock)
   - With fixed dock, PlayerBar should stay at `bottom: calc(var(--dock-height) + 8px)` using the same variable

## Risks / Trade-offs

- Fixed position removes the dock from document flow; layout shifts if padding is not calculated correctly → Mitigation: measure actual dock height via CSS variable
- If Telegram WebApp changes viewport (keyboard opens), `fixed` might behave differently than `sticky` → Mitigation: test with Telegram keyboard open
- PlayerBar bottom offset needs recalculation → Mitigation: derive from same CSS variable
