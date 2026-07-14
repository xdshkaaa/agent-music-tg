## Why

Playlist generation is currently free for allowlisted users with no monetization or usage caps. Adding CryptoBot Crypto Pay integration enables selling generation access (credit packages and subscriptions) via cryptocurrency, creating a revenue stream and protecting the service from unlimited abuse.

## What Changes

- Introduce a **paywall on playlist generation**: each user has a credit balance and/or active subscription. Generation is allowed only when the user has credits or a live subscription; otherwise the bot shows a purchase prompt.
- Integrate **CryptoBot Crypto Pay**: create invoices via the Crypto Pay REST API, present payment links, and confirm payment through signed webhooks with a polling fallback. On confirmed payment, credit the buyer's balance or extend their subscription (idempotent per invoice).
- Add **purchasable offers** (credit packages and subscriptions) configured by admins: title, price, asset, and what it grants.
- Add **user profile / paywall UX**: `/buy` command showing offers, `/profile` with balance and subscription info, and purchase prompt when generation is blocked.
- Add **admin panel** (Telegram `/admin` inline menu and Mini App admin screens): statistics, offer management, broadcast messaging, and shop settings.
- Persist new domain state in SQLite: users, offers, invoices/payments, shop settings. **BREAKING**: new required env var `CRYPTOBOT_TOKEN`.

## Capabilities

### New Capabilities
- `payments`: CryptoBot Crypto Pay invoice lifecycle — creating invoices, confirming payment via webhook + polling, idempotent fulfillment, offer catalog (packages/subscriptions).
- `generation-access`: entitlement model gating playlist generation — credit balances, subscription windows, consuming access on successful generation, purchase-prompt flow.
- `admin-panel`: operator surface for statistics (users/sales/revenue), managing offers and pricing, broadcasting messages to all users, editing shop settings.

### Modified Capabilities
<!-- No existing specs to modify. -->

## Impact

- **Server**: new `server/payments/` (Crypto Pay client, webhook verification, invoice/offer stores, fulfillment), new `server/access/` (entitlements), new `server/admin/` (stats, broadcast). Changes to `server/bot/index.ts` (buy/admin commands, purchase prompt), `server/api/routes.ts` (offers, invoice, webhook, admin endpoints), `server/core/run-generation.ts` (access check + credit consumption), `server/db.ts` (new tables + migrations), `server/env.ts` (CryptoBot config).
- **Mini App**: new purchase screen, profile balance display, admin screens (stats, offers, broadcast, settings).
- **Dependencies**: no new runtime dependencies (use `fetch` against Crypto Pay REST API); webhook signature verified with built-in crypto.
- **Config/docs**: `.env.example`, `README.md` updated with CryptoBot setup.
- **External**: outbound calls to `https://pay.crypt.bot/api`; inbound webhook endpoint must be publicly reachable.
