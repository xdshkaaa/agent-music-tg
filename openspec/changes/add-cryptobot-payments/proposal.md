## Why

Playlist generation currently runs for free for anyone on the allowlist, so there is no way to monetize the bot or cap usage. Adding CryptoBot payments lets us sell generation access (packages and subscriptions) in crypto, and a proper admin panel lets a non-technical operator manage pricing, watch revenue, and broadcast to users — mirroring the digital-shop bot workflow but adapted to this music-playlist product.

## What Changes

- Introduce a **paywall on playlist generation**: each user has a balance of generation credits and/or an active subscription window. Generation is allowed only when the user has credits or a live subscription; otherwise the bot/Mini App shows a purchase prompt.
- Add **CryptoBot Crypto Pay integration**: create invoices via the Crypto Pay API, present a pay link/button, and confirm payment via a signed **webhook** with a periodic **`getInvoices` polling fallback**. On confirmed payment, credit the buyer's balance or extend their subscription (idempotent per invoice).
- Add **purchasable offers** (packages/subscriptions) configured by admins: title, price (fiat-pegged or crypto asset), and what it grants (N credits or M days of subscription).
- Add a **user profile / paywall UX**: `/buy` command + Mini App screen showing offers, remaining credits, subscription expiry, and purchase history.
- Add an **admin panel** (Telegram `/admin` inline menu + Mini App admin screens): statistics (users, sales, revenue), offer/pricing management, broadcast to all users, and shop settings (shop name, support contact, about text). **BREAKING** for env: new required `CRYPTOBOT_TOKEN` (and optional `CRYPTOBOT_WEBHOOK_SECRET`, `CRYPTOBOT_NETWORK`).
- Persist new domain state in SQLite: users, offers, invoices/payments, and shop settings; record every user who starts the bot so broadcast + stats have an audience.

## Capabilities

### New Capabilities
- `payments`: CryptoBot Crypto Pay invoice lifecycle — creating invoices for an offer, confirming payment via webhook + polling fallback, idempotent fulfillment, and the offer catalog (packages/subscriptions).
- `generation-access`: entitlement model gating playlist generation — credit balances, subscription windows, decrementing/consuming access on generation, and the purchase-prompt flow when access is exhausted.
- `admin-panel`: operator surface for statistics (users/sales/revenue), managing offers and pricing, broadcasting messages to all users, and editing shop settings.

### Modified Capabilities
<!-- None: no pre-existing openspec specs to modify. -->

## Impact

- **Server (`server/`)**: new `server/payments/` (Crypto Pay client, webhook verify, invoice/offer store, fulfillment), new `server/access/` (entitlements), new `server/admin/` (stats, broadcast). Changes to `server/bot/index.ts` (buy/admin commands, purchase prompt), `server/api/routes.ts` (offers, invoice-create, webhook, admin endpoints), `server/core/run-generation.ts` (access check + credit consumption), `server/db.ts` (new tables + migrations), `server/env.ts` (CryptoBot config), `server/index.ts` (mount webhook route, start polling).
- **Mini App (`miniapp/`)**: new offers/purchase screen, profile balance display, and admin screens (stats, offers, broadcast, settings); `miniapp/src/lib/api.ts` additions.
- **Dependencies**: no new runtime dep required (use `fetch` against Crypto Pay REST API); webhook signature verified with built-in crypto.
- **Config/docs**: `.env.example`, `README.md` updated with CryptoBot setup and payment/rollback notes.
- **External**: outbound calls to `https://pay.crypt.bot/api` (or testnet); inbound webhook endpoint must be publicly reachable.
