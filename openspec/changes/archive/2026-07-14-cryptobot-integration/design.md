## Context

The bot is a Bun + TypeScript service: grammy bot (long-polling) in `server/bot/`, a Hono API in `server/api/` (JWT/initData auth via `requireAuth`/`requireAdmin`), a SQLite store in `server/db.ts` with a `settings` key-value table, and playlist generation in `server/core/run-generation.ts`. Admin identity already exists (`ADMIN_CHAT_IDS`, `allowlist.is_admin`, `ctx.isAdmin`, `requireAdmin`). Generation is currently free for allowlisted users.

We are adding paid access to generation via CryptoBot Crypto Pay, plus an operator admin panel.

## Goals / Non-Goals

**Goals:**
- Gate `startGeneration` behind an entitlement check (credits or active subscription) enforced identically for bot and Mini App.
- Sell offers (credit packages, subscription days) through Crypto Pay invoices, confirmed by signed webhook with a `getInvoices` polling fallback, fulfilled idempotently.
- Give admins a Telegram inline `/admin` panel and Mini App admin screens for stats, offer/pricing management, broadcast, and shop settings.
- Reuse existing auth, settings, and DB patterns — no new heavy dependencies.

**Non-Goals:**
- No full digital-goods catalog — offers only grant generation access.
- No fiat gateways, refunds, or partial refunds.
- No multi-currency conversion beyond what Crypto Pay handles.
- No changes to the AI provider or music backend selection features.

## Decisions

**1. Entitlement model: credits + subscription in a `users` table.**
Add a `users` table keyed by `chat_id` with `credits INTEGER`, `subscription_until INTEGER` (unix, nullable), plus profile fields. Access = `credits > 0 OR subscription_until > now`. Every `/start` and authenticated API call upserts the user row.
*Alternative rejected:* storing entitlement in the settings KV — awkward for per-user rows and stats.

**2. Consumption rule: subscription is unlimited, credits decrement by one per successful generation.**
Check access before running; consume after a successful outcome only (not on error/clarify). Subscription users never lose credits.
*Alternative rejected:* charging on start — users would lose credits on generation errors.

**3. Crypto Pay via REST + `fetch`, no SDK.**
Call `https://pay.crypt.bot/api/*` (or testnet variant) with header `Crypto-Pay-API-Token`. Methods: `createInvoice`, `getInvoices`. Zero new dependencies.

**4. Confirmation: signed webhook + polling fallback.**
- Webhook: mount `POST /api/crypto/webhook` outside `requireAuth`. Verify HMAC-SHA256 of raw body with key `SHA256(app_token)` against `crypto-pay-api-signature` header, constant-time compare.
- Polling: periodic `getInvoices` for locally-pending invoice IDs.
Both paths call the same `fulfillInvoice(invoiceId)`.

**5. Idempotent fulfillment via invoice status transition.**
`invoices` table with status `pending → paid` transition guarded by `UPDATE ... WHERE status='pending'`. Fulfillment grants credits/subscription only when that UPDATE changed a row.

**6. Offers in their own table, editable by admins.**
`offers` table: `id`, `title`, `amount`, `asset`, `active`, `grant_kind`, `grant_amount`. Admin FSM via grammy inline keyboards + callback queries, reusing the existing `sessions` table pattern.

**7. Shop settings via existing `settings` KV.**
`shop_name`, `support_contact`, `about_text` stored through `server/lib/settings.ts` with sensible defaults.

**8. Admin panel spans bot + Mini App.**
Bot `/admin` inline menu for phone; Mini App admin screens for richer editing. Both hit the same Hono handlers under `requireAdmin`.

## Risks / Trade-offs

- **Webhook endpoint publicly exposed** → Verify signature with constant-time compare; treat webhook as untrusted, rely on invoice status guard.
- **Missed/duplicate confirmations** → Polling fallback recovers misses; status-transition guard makes fulfillment idempotent.
- **Broadcast rate limits** → Send sequentially with error tolerance, small delay between sends.
- **Price/asset drift** → Store exact `amount`/`asset` on the invoice at creation, not the live offer value.
- **Existing free users** → Feature-flag `PAYMENTS_ENABLED`; with it off, `hasAccess` returns true.

## Migration Plan

1. Add tables (`users`, `offers`, `invoices`) via `migrate()` in `server/db.ts` (additive, no destructive changes).
2. Add env: `CRYPTOBOT_TOKEN`, `CRYPTOBOT_NETWORK` (mainnet default), update `.env.example` + `README.md`.
3. Deploy server; register `/api/crypto/webhook` and start polling timer; configure webhook URL in Crypto Pay app.
4. Seed initial offers and shop settings via admin panel or one-off script.
5. Optional: grant existing allowlist users starter credits.
6. **Rollback**: set `PAYMENTS_ENABLED=false` to bypass paywall; tables remain harmless.

## Open Questions

- Default asset/currency for offers (USDT vs. TON) — to be set when seeding offers.
- Whether to seed starter credits for existing allowlist users on first deploy.
- Polling interval and broadcast inter-message delay (start ~60s polling, ~50ms broadcast pacing).
