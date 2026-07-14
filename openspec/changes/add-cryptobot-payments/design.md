## Context

The bot is a Bun + TypeScript service: grammy bot (long-polling) in `server/bot/`, a Hono API in `server/api/` (JWT/initData auth via `requireAuth`/`requireAdmin`), a SQLite store in `server/db.ts` with a `settings` key-value table and helpers in `server/lib/settings.ts`, and playlist generation in `server/core/run-generation.ts` (`startGeneration`/`resumeGeneration`). Admin identity already exists (`ADMIN_CHAT_IDS`, `allowlist.is_admin`, `ctx.isAdmin`, `requireAdmin`). Generation is currently free for anyone past the allowlist gate.

We are adding paid access to generation via CryptoBot Crypto Pay, plus an operator admin panel. The reference is a Python aiogram digital-shop bot; we keep its UX shape (buy / profile / admin stats-broadcast-settings) but adapt "products" to generation packages/subscriptions for this music product.

## Goals / Non-Goals

**Goals:**
- Gate `startGeneration` behind an entitlement check (credits or active subscription) enforced identically for bot and Mini App.
- Sell offers (credit packages, subscription days) through Crypto Pay invoices, confirmed by signed webhook with a `getInvoices` polling fallback, fulfilled idempotently.
- Give admins a Telegram inline `/admin` panel and Mini App admin screens for stats, offer/pricing management, broadcast, and shop settings.
- Reuse existing auth, settings, and DB patterns — no new heavy dependencies.

**Non-Goals:**
- No full digital-goods catalog (categories, uploaded file/text products) — offers only grant generation access.
- No fiat gateways, refunds, or partial refunds.
- No multi-currency conversion logic beyond what Crypto Pay handles; we store the asset/amount Crypto Pay quotes.
- No change to the AI provider / music backend selection features.

## Decisions

**1. Entitlement model: credits + subscription, in a `users` table.**
Add a `users` table keyed by `chat_id` with `credits INTEGER`, `subscription_until INTEGER` (unix, nullable), plus profile fields (`username`, `first_seen`, `last_seen`). Access = `credits > 0 OR subscription_until > now`. The `allowlist` table stays the access *gate*; `users` is the *audience + entitlement* record (also what broadcast/stats enumerate). Every `/start` and every authenticated API call upserts the user row so the audience is complete.
*Alternative:* store entitlement in the `settings` KV — rejected: awkward for per-user rows, stats, and broadcast enumeration.

**2. Consumption rule: subscription is unlimited, credits decrement by one per successful generation.**
Check access before running; consume after a successful outcome only (not on `error`, not on `clarify` — clarify is mid-flow, charge once on final success). Subscription users never lose credits. This keeps a failed/aborted run free and matches the "packages OR subscription" model chosen.
*Alternative:* charge on start — rejected: users would lose credits on generation errors.

**3. Crypto Pay via REST + `fetch`, no SDK.**
Call `https://pay.crypt.bot/api/*` (or `https://testnet-pay.crypt.bot/api/*` when `CRYPTOBOT_NETWORK=testnet`) with header `Crypto-Pay-API-Token`. Methods: `createInvoice`, `getInvoices`. Keeps the dependency surface at zero and matches the existing "call REST with fetch" style used for AI/music backends.

**4. Confirmation: signed webhook + polling fallback (as chosen).**
- Webhook: mount `POST /api/crypto/webhook` **outside** `requireAuth` (Crypto Pay is unauthenticated to our JWT). Verify per Crypto Pay's scheme: `HMAC-SHA256` of the raw request body using a key of `SHA256(app_token)`, compared to the `crypto-pay-api-signature` header, using a constant-time compare. Reject on mismatch.
- Polling: a timer (started in `server/index.ts`) periodically calls `getInvoices` for locally-`pending` invoice ids and fulfills any Crypto Pay reports as `paid`.
Both paths call the same `fulfillInvoice(invoiceId)`.

**5. Idempotent fulfillment via invoice status transition.**
`invoices` table: `invoice_id PRIMARY KEY`, `chat_id`, `offer_id`, `amount`, `asset`, `status ('pending'|'paid')`, `created_at`, `paid_at`. Fulfillment runs inside a transaction that flips `status` `pending → paid` with a guarded `UPDATE ... WHERE status='pending'`; the grant (credits/subscription) is applied only when that UPDATE changed a row. Concurrent webhook+poll therefore grant exactly once.

**6. Offers in their own table, editable by admins.**
`offers` table: `id`, `title`, `amount`, `asset`, `active INTEGER`, `grant_kind ('credits'|'subscription')`, `grant_amount` (credits count or days). Reuse `requireAdmin` for management endpoints; bot admin panel uses grammy `InlineKeyboard` + callback queries with a small FSM stored in the existing `sessions` table (same pattern as `pendingClarify`).

**7. Shop settings via existing `settings` KV.**
`shop_name`, `support_contact`, `about_text` stored through `server/lib/settings.ts` helpers. Start/about/support/purchase-prompt messages read from there with sensible defaults, so no schema change for settings.

**8. Admin panel spans bot + Mini App.**
Bot `/admin` inline menu (stats / offers / broadcast / settings) covers the operator-from-phone case; Mini App admin screens reuse the admin API endpoints for richer editing. Both hit the same Hono handlers under `requireAdmin`, so authz lives in one place.

## Risks / Trade-offs

- **Webhook endpoint publicly exposed** → Verify signature with constant-time compare, reject unsigned; treat webhook as untrusted and rely on invoice status guard so a forged "paid" without a matching pending invoice grants nothing.
- **Missed/duplicate confirmations** → Polling fallback recovers misses; status-transition guard makes fulfillment idempotent across webhook+poll.
- **Long-polling bot has no HTTP server of its own** → Webhook is served by the existing Hono app in `server/index.ts`; ensure the route is registered before `requireAuth` and reachable at `PUBLIC_ORIGIN`.
- **Broadcast rate limits / blocked users** → Send sequentially with error tolerance (skip failures), report success count; consider a small delay between sends to respect Telegram limits.
- **Price/asset drift** → Store the exact `amount`/`asset` on the invoice at creation so fulfillment and revenue stats use the quoted value, not the live offer (which admins may later edit).
- **Existing free users** → After deploy, generation requires access; mitigate by optionally seeding credits for current allowlist users and documenting it (see Migration).

## Migration Plan

1. Add tables (`users`, `offers`, `invoices`) via `migrate()` in `server/db.ts` using `CREATE TABLE IF NOT EXISTS` (additive, no destructive change).
2. Add env: `CRYPTOBOT_TOKEN` (required for payments), `CRYPTOBOT_WEBHOOK_SECRET`/derived, `CRYPTOBOT_NETWORK` (`mainnet` default), update `.env.example` + `README.md`.
3. Deploy server; register `/api/crypto/webhook` and start the polling timer; configure the webhook URL in the Crypto Pay app to `PUBLIC_ORIGIN/api/crypto/webhook`.
4. Seed initial offers (via admin panel or a one-off) and shop settings.
5. Optional: grant existing allowlist users a starter credit balance to avoid a hard paywall on first release.
6. **Rollback**: feature-flag the paywall (e.g. `PAYMENTS_ENABLED`); with it off, `hasAccess` returns true for all so generation is free again. Tables remain (harmless). Revert the deploy to fully remove endpoints.

## Open Questions

- Default asset/currency for offers (e.g. USDT vs. TON) and whether prices are fiat-pegged via Crypto Pay's `fiat`/`accepted_assets` — to be set when seeding offers.
- Whether to seed starter credits for existing allowlist users on first deploy (product decision).
- Polling interval and broadcast inter-message delay (start ~60s polling, ~50/s Telegram-safe broadcast pacing) — tune in tasks.
