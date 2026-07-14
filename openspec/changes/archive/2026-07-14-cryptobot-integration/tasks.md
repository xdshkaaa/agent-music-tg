## 1. Config & schema

- [x] 1.1 Add `cryptobotToken`, `cryptobotNetwork` (mainnet default), optional webhook secret, and `paymentsEnabled` flag to `server/env.ts`
- [x] 1.2 Update `.env.example` with `CRYPTOBOT_TOKEN`, `CRYPTOBOT_NETWORK`, `PAYMENTS_ENABLED`
- [x] 1.3 Add `users`, `offers`, `invoices` tables to `migrate()` in `server/db.ts` (CREATE TABLE IF NOT EXISTS, per design schema)
- [x] 1.4 Add shop-settings helpers (`shop_name`, `support_contact`, `about_text`) to `server/lib/settings.ts` with defaults

## 2. Data stores

- [x] 2.1 `server/payments/offers-store.ts`: create/list/get/update/deactivate offers; listActive()
- [x] 2.2 `server/payments/invoices-store.ts`: insert pending invoice, get by id, list pending, guarded markPaid transition returning whether it changed
- [x] 2.3 `server/access/users-store.ts`: upsert user, get, list all, add credits, extend subscription, consume one credit

## 3. Access / entitlements

- [x] 3.1 `server/access/entitlements.ts`: hasAccess(db, chatId) — credits>0 OR subscription_until>now; honor paymentsEnabled=false → always true
- [x] 3.2 `server/access/entitlements.ts`: consumeAccess(db, chatId) — no-op for active subscription, decrement one credit otherwise
- [x] 3.3 Gate `startGeneration`/`resumeGeneration` in `server/core/run-generation.ts`: return needs_purchase outcome when no access; consume only on final success (not on error/clarify)

## 4. Crypto Pay integration

- [x] 4.1 `server/payments/crypto-pay.ts`: REST client using fetch + Crypto-Pay-API-Token, base URL by network; createInvoice, getInvoices
- [x] 4.2 `server/payments/webhook.ts`: verify signature (HMAC-SHA256 of raw body with key SHA256(token), constant-time compare) against crypto-pay-api-signature header
- [x] 4.3 `server/payments/fulfillment.ts`: fulfillInvoice(db, invoiceId) — guarded status flip, then apply offer grant (credits or subscription days) idempotently
- [x] 4.4 `server/payments/poller.ts`: interval task calling getInvoices for pending ids, fulfilling paid ones; start/stop helpers

## 5. API endpoints

- [x] 5.1 `GET /offers` and `POST /invoices` (create invoice for active offer, return pay URL) in `server/api/routes.ts` under requireAuth
- [x] 5.2 `GET /me` extended with credits, subscription expiry; add `GET /me/purchases` (invoice history)
- [x] 5.3 `POST /api/crypto/webhook` mounted in `server/index.ts` before requireAuth; verify then fulfillInvoice
- [x] 5.4 Admin endpoints under requireAdmin: GET /admin/stats, offers CRUD, POST /admin/broadcast, GET/POST /admin/shop-settings
- [x] 5.5 Start the poller and register webhook route in `server/index.ts`

## 6. Bot UX

- [x] 6.1 Upsert user row on /start and each authenticated interaction; use shop settings in start/about/support text
- [x] 6.2 /buy command: list active offers with inline buttons; on select, create invoice and send pay URL
- [x] 6.3 /profile command: show credits, subscription expiry, purchase history
- [x] 6.4 In message:text handler, when generation returns needs_purchase, reply with purchase prompt + offers
- [x] 6.5 /admin inline panel (admin-only): Statistics, Offers (add/edit/activate/deactivate), Broadcast, Settings — using sessions FSM

## 7. Mini App

- [x] 7.1 `miniapp/src/lib/api.ts`: add offers, create-invoice, purchases, and admin (stats/offers/broadcast/settings) calls
- [x] 7.2 Offers/purchase screen + profile balance display (open pay URL via Telegram)
- [x] 7.3 Admin screens (stats, offers management, broadcast, shop settings) gated on isAdmin

## 8. Verification & docs

- [x] 8.1 Unit tests: idempotent fulfillment, access check + credit consumption rules, webhook signature verify (valid/invalid)
- [x] 8.2 Manual test on Crypto Pay testnet: create invoice → pay → webhook fulfills; simulate missed webhook → poller fulfills
- [x] 8.3 Update README.md: CryptoBot setup, env vars, admin panel usage, rollback via PAYMENTS_ENABLED
- [x] 8.4 Run `openspec validate cryptobot-integration` and fix issues
