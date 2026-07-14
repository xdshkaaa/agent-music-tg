## 1. Bot trial:claim payments guard

- [x] 1.1 In `server/bot/shop.ts`, add `env` import and `getPaymentsEnabled` import if not already present
- [x] 1.2 Guard the bot `trial:claim` handler: check `env.paymentsEnabled` (or `getPaymentsEnabled(db, env.paymentsEnabled)`) before calling `claimTrial`; reply "Магазин временно недоступен." when disabled

## 2. Bot keyboard update after claim

- [x] 2.1 After successful `claimTrial` in `server/bot/shop.ts`, build a fresh keyboard via `offersKeyboard(db, chatId)` and edit the original message markup with `ctx.editMessageReplyMarkup`
- [x] 2.2 Wrap the edit in try/catch to handle messages too old to edit (>48h)

## 3. Mini App BuyScreen refresh after claim

- [x] 3.1 In `miniapp/src/screens/BuyScreen.tsx`, add `void refresh()` call after `setTrial(result.trial)` in the `claimTrial` success path

## 4. Tests

- [x] 4.1 Add test for bot `trial:claim` handler: payments disabled → claim not granted, reply sent
- [x] 4.2 Add test for bot `trial:claim` handler: after successful claim, keyboard is edited (or attempt is made)
- [x] 4.3 Run server test suite (`bun test`) — green

## 5. Verify

- [x] 5.1 `bun run` typecheck/build for miniapp — green
- [x] 5.2 `openspec validate --change fix-free-pack-crediting` passes
