## 1. CSS: Fixed dock positioning + spacing

- [x] 1.1 Add `--dock-height` CSS custom property to `:root` (value: `64px`)
- [x] 1.2 Change `.dock` from `position: sticky` to `position: fixed` with `bottom: 0; left: 0; right: 0;` and `z-index: 100`
- [x] 1.3 Add bottom padding to `.app-shell` via `padding-bottom: calc(40px + var(--dock-height))` so content is not obscured
- [x] 1.4 Update `.player-bar` to use `bottom: calc(var(--dock-height) + 8px)` instead of hardcoded `76px`

## 2. Component: Extract BottomNav

- [x] 2.1 Create `miniapp/src/components/BottomNav.tsx` with the dock markup extracted from `App.tsx`
- [x] 2.2 Component accepts `tab: "create" | "shop" | "profile" | "admin"` and `isAdmin: boolean` props
- [x] 2.3 Import Phosphor icons (`Sparkle`, `Storefront`, `User`, `Shield`), export as default

## 3. Integrate BottomNav into App.tsx

- [x] 3.1 Import `BottomNav` in `App.tsx`, replace inline `<nav className="dock">` block with `<BottomNav tab={tab} isAdmin={isAdmin} />`
- [x] 3.2 Remove inline dock markup, `Sparkle/Storefront/User/Shield` icon imports if no longer used elsewhere
- [x] 3.3 Verify all screens render correctly with fixed dock

## 4. Verify

- [x] 4.1 Dock is visible at bottom on all screens (prompt, clarify, results, buy, profile, admin)
- [x] 4.2 Dock stays visible when scrolling long content
- [x] 4.3 PlayerBar appears above dock without overlap
- [x] 4.4 Last content element is not hidden behind dock
- [x] 4.5 No visual regressions in light/dark schemes
