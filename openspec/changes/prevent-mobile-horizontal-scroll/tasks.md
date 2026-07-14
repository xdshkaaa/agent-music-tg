## 1. Root-level horizontal scroll guard

- [x] 1.1 Add `overflow-x: hidden` and `overscroll-behavior-x: none` to `.app-shell` in `glass.css`
- [x] 1.2 Verify that `.segmented`, `.admin-tabs`, `.category-pills` still scroll horizontally after the root guard

## 2. Glass panel overflow fix

- [x] 2.1 Add `max-width: 100%; box-sizing: border-box;` to `.glass-panel` in `glass.css`

## 3. Per-screen overflow audit

- [x] 3.1 Audit `PromptScreen.tsx` for overflow culprits and fix them
- [x] 3.2 Audit `ClarifyScreen.tsx` for overflow culprits and fix them
- [x] 3.3 Audit `ResultsScreen.tsx` for overflow culprits and fix them
- [x] 3.4 Audit `ProfileScreen.tsx` for overflow culprits and fix them
- [x] 3.5 Audit `SettingsScreen.tsx` for overflow culprits and fix them
- [x] 3.6 Audit `BuyScreen.tsx` for overflow culprits and fix them
- [x] 3.7 Audit `AdminScreen.tsx` for overflow culprits and fix them

## 4. Text overflow protection

- [x] 4.1 Ensure all unconstrained text containers have `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` or `word-break: break-word` as appropriate

## 5. Verification

- [ ] 5.1 Test all screens on a real mobile device / emulator for horizontal scroll — manual
- [ ] 5.2 Verify intentional scrollable regions (segmented, admin-tabs, category-pills) still work — manual
- [ ] 5.3 Test with long track titles and varied content lengths — manual
