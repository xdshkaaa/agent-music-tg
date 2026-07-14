# Tasks: free-trial-package

## 1. Data layer

- [x] 1.1 Add additive `users` columns in `server/db.ts` via existing `try { ALTER TABLE … } catch {}` pattern: `trial_credits INTEGER NOT NULL DEFAULT 0`, `trial_until INTEGER`, `trial_claimed_at INTEGER`
- [x] 1.2 Extend `User`/`UserRow`/`toUser` in `server/access/users-store.ts` with `trialCredits`, `trialUntil`, `trialClaimedAt`
- [x] 1.3 Add constants `TRIAL_CREDITS = 10`, `TRIAL_DAYS = 3` and `claimTrial(db, chatId): boolean` (ensureUser + atomic conditional UPDATE guarded by `trial_claimed_at IS NULL`) in `users-store.ts`
- [x] 1.4 Add `consumeTrialCredit(db, chatId): boolean` (UPDATE guarded by `trial_credits > 0 AND trial_until > unixepoch()`) in `users-store.ts`

## 2. Access logic

- [x] 2.1 `server/access/entitlements.ts`: extend `hasAccess` with active-trial predicate (`trialCredits > 0 && trialUntil > now`)
- [x] 2.2 `server/access/entitlements.ts`: extend `consumeAccess` — subscription free, then `consumeTrialCredit`, fallback `consumeCredit`

## 3. API

- [x] 3.1 `GET /me` in `server/api/routes.ts`: add additive `trial: { claimed, active, creditsLeft, until }` object
- [x] 3.2 Add `POST /trial/claim` in `server/api/routes.ts`: gated by `getPaymentsEnabled` (503 like `/invoices`); success returns trial status; repeat claim → `409 { error: "trial already claimed" }`

## 4. Bot

- [x] 4.1 `server/bot/shop.ts`: pass caller `chatId` into `offersKeyboard`/`sendOffers`; prepend "🎁 Бесплатный пакет — 10 генераций на 3 дня" button (`trial:claim`) when `trialClaimedAt` is null
- [x] 4.2 Add `trial:claim` callback handler: `claimTrial`; reply "✅ Бесплатный пакет активирован: 10 генераций на 3 дня" or "Бесплатный пакет уже был активирован."
- [x] 4.3 `/profile`: show active-trial line (credits left + expiry date via `ru-RU` formatting, like `formatSubscription`)

## 5. Mini App

- [x] 5.1 `miniapp/src/lib/api.ts`: extend `MeResponse` with `trial` field; add `api.claimTrial()` → `POST /trial/claim`
- [x] 5.2 `miniapp/src/screens/BuyScreen.tsx`: fetch `/me` in the refresh `Promise.all`; render free-package card above offers while `trial.claimed === false` with "Забрать бесплатно" button; on claim show success (reuse `showSuccess` pattern) and hide card
- [x] 5.3 `miniapp/src/screens/ProfileScreen.tsx`: show active trial (credits left, expiry) alongside credits/subscription

## 6. Tests

- [x] 6.1 users-store/entitlements tests: claim is once-only; second `claimTrial` returns false
- [x] 6.2 `hasAccess`: true during active trial; false after expiry or exhaustion when no paid credits/subscription
- [x] 6.3 `consumeAccess`: trial credits drained before paid credits; expired trial never consumed (falls back to paid); subscriber uncharged
- [x] 6.4 API tests (style of `server/api/me.test.ts` / `invoices.test.ts`): `POST /trial/claim` happy path, repeat → 409, payments disabled → 503; `/me` reports trial status

## 7. Verify

- [x] 7.1 Run server test suite (`bun test`) — green
- [x] 7.2 `bun run` typecheck/build for miniapp — green
- [x] 7.3 `openspec validate --change free-trial-package` passes
