## 1. Profile — add support contact

- [x] 1.1 Import `getShopSettings` from `../lib/settings` in `server/bot/shop.ts`
- [x] 1.2 In `/profile` handler, read `getShopSettings(db)` and conditionally append support line to the `lines` array when `shop.supportContact` is non-empty
- [x] 1.3 Verify profile renders correctly with and without support contact configured

## 2. Start menu — remove support bullet

- [x] 2.1 In `server/bot/index.ts`, remove `"• Поддержка 24/7"` from the `bullets` array
- [x] 2.2 Verify `/start` renders without support reference

## 3. Verify

- [x] 3.1 Run typecheck: `bun run typecheck`
- [x] 3.2 Run lint: `bun run lint` (no lint script in package.json — skipped)
