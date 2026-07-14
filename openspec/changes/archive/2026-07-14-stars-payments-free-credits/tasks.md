# Tasks: stars-payments-free-credits

## 1. Data layer

- [x] 1.1 Migration in `server/db.ts`: rebuild `invoices` as `id` PK + `provider` + `external_id` (unique `(provider, external_id)`), copy existing rows as `provider='crypto'`, guarded and transactional
- [x] 1.2 Migration: add `offers.stars_amount INTEGER NULL`
- [x] 1.3 Update `server/payments/invoices-store.ts` to the new shape (`insertPendingInvoice`, `markPaid`, lookups keyed by provider+external_id); add `insertPaidStarsInvoice` with `INSERT OR IGNORE` returning whether it inserted
- [x] 1.4 Update `server/payments/offers-store.ts`: `starsAmount` in Offer/OfferInput, CRUD, validation (positive integer or null)
- [x] 1.5 `server/access/users-store.ts`: `SIGNUP_BONUS_CREDITS = 10`; fresh inserts in `upsertUser`/`ensureUser` start with the bonus; existing rows untouched
- [x] 1.6 Unit tests: migration preserves rows; bonus granted once (all four spec scenarios); stars insert idempotent

## 2. Stars fulfillment (server/payments)

- [x] 2.1 New `server/payments/stars.ts`: `fulfillStarsPayment(db, {chargeId, chatId, offerId, starsAmount})` — transactional insert-or-ignore + grant on insert only
- [x] 2.2 Update `server/payments/fulfillment.ts`/`purchase.ts` to new invoices-store API (crypto path behavior unchanged)
- [x] 2.3 Unit tests: duplicate charge id grants once; crypto webhook/poller race still grants once

## 3. Bot flow

- [x] 3.1 `server/bot/shop.ts`: dual-price offers → method-choice keyboard (`buyc:`/`buys:`); crypto-only unchanged; offer labels show Stars price when set
- [x] 3.2 Stars invoice: `replyWithInvoice` with currency `XTR`, payload `{chatId, offerId}`
- [x] 3.3 `pre_checkout_query` handler: validate offer exists + active, answer within limits
- [x] 3.4 `message:successful_payment` handler: call `fulfillStarsPayment`, confirm to user
- [x] 3.5 Admin panel (bot): Stars price in offer create/edit and offer listing

## 4. API + Mini App

- [x] 4.1 `POST /invoices`: accept `method`; stars → `createInvoiceLink` via bot api (inject bot into route registration); 400 for stars on crypto-only offer; payments-disabled check applies to both
- [x] 4.2 `miniapp/src/lib/api.ts` + `lib/telegram.ts`: pass method; `openInvoice` wrapper + `invoiceClosed` event
- [x] 4.3 `BuyScreen.tsx`: method choice on dual-price offers; on paid close, refetch `/me` with short retry
- [x] 4.4 `AdminScreen.tsx`: optional Stars price field with validation; display in offers list
- [x] 4.5 Test: `server/api/me.test.ts`-style route test for `POST /invoices` stars branch

## 5. Verify + deploy

- [x] 5.1 Full test suite green (`bun test`)
- [x] 5.2 Local run: bot /buy shows method choice; migration runs clean on copy of prod DB
- [x] 5.3 Deploy via `deploy/deploy.sh`; healthz; live smoke: Stars test purchase (cheapest offer) + crypto invoice creation; new-user bonus check
  - Deployed 20260714155059, healthz OK, prod invoices migrated (4 rows -> provider=crypto), live crypto invoice created via deployed code (56731763). Stars: offer «тестинг» given a 1 ⭐ test price — final paid-purchase click needs a human (real Stars); bonus covered by unit tests, existing users untouched in prod (credits unchanged).
