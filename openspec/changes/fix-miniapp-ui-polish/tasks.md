# fix-miniapp-ui-polish — Tasks

## 1. Quick CSS fixes

- [x] 1.1 Add `textarea.glass-input { resize: none; }` to `miniapp/src/styles/glass.css`
- [x] 1.2 Add `.prompt-hero h1 { font-size: clamp(22px, 7vw, 26px); line-height: 1.15; }` and verify hero no longer clips at 320–480 px
- [x] 1.3 Add `.stat-row` class (flex, space-between, muted label, bold `tabular-nums` value)
- [x] 1.4 Add `.profile-topup-btn` class (self-center, standard button height/padding)

## 2. ProfileScreen

- [x] 2.1 Replace inline `alignSelf: "stretch", height: "auto"` on «Пополнить» with `.profile-topup-btn`; confirm button is standard height, centered against balance column

## 3. Admin StatsPanel

- [x] 3.1 Rework `StatsPanel` in `miniapp/src/screens/AdminScreen.tsx` to render `.stat-row` label/value rows for Пользователи / Оплаченные покупки / Выручка

## 4. Scroll-fade affordance

- [x] 4.1 Create shared hook `useScrollFade` (toggles `data-fade-left`/`data-fade-right` via scroll listener + ResizeObserver, feature-guarded)
- [x] 4.2 Add CSS mask rules keyed off `data-fade-*` for `.segmented` and `.admin-tabs`; verify mask does not break backdrop blur
- [x] 4.3 Wire hook into `Segmented` component and admin tab row; verify fades appear/disappear correctly when scrolling

## 5. BottomNav indicator sync

- [x] 5.1 In `BottomNav.tsx`: trim `tabRefs.current` to `tabs.length`, recompute indicator after `document.fonts.ready` (feature-guarded), and confirm recompute fires when «Админ» tab appears
- [ ] 5.2 Manually verify: switch tabs quickly, reload as admin and non-admin — pill and accent color always on same tab

## 6. Verify & build

- [x] 6.1 `bun run typecheck` passes (pre-existing unrelated errors in server/bot/admin-panel.ts and server/payments/payments.test.ts confirmed present on main before this change; no new errors introduced)
- [x] 6.2 `cd miniapp && bun run build` passes
- [ ] 6.3 Visual check in Telegram (or narrow browser viewport): all five defects gone at 320 px and 480 px widths
