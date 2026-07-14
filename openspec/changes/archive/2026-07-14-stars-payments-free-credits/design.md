# Design: Telegram Stars payments + free signup credits

## Context

Payments currently run exclusively through CryptoBot Crypto Pay: `purchaseOffer` creates a crypto invoice, `invoices` uses the Crypto Pay `invoice_id` as its primary key, and fulfillment is idempotent via the guarded `pending -> paid` UPDATE in `markPaid`. Both a webhook and a poller can report the same payment; the transition guard ensures exactly-once granting. Users are stored in `users` with a `credits` counter consumed per generation; `upsertUser` runs on every bot update and Mini App auth, `ensureUser` runs lazily on grant paths.

Telegram Stars (currency `XTR`) is Telegram's native payment rail: the bot sends an invoice (`sendInvoice` / `createInvoiceLink` with empty `provider_token`), Telegram fires `pre_checkout_query` (must answer within 10s), then delivers `successful_payment` in a message containing `telegram_payment_charge_id`.

## Goals / Non-Goals

**Goals:**
- Offers optionally purchasable with Telegram Stars, alongside the existing crypto price.
- Stars purchase works both in the bot chat and inside the Mini App without leaving Telegram.
- Exactly-once fulfillment semantics preserved across both providers.
- New users get 10 free generation credits exactly once.

**Non-Goals:**
- No Stars refund handling (`refunded_payment`) beyond logging — manual via Bot API if ever needed.
- No admin-configurable signup bonus amount (hardcoded constant; trivially changed later).
- No retroactive bonus for existing users.
- No changes to the CryptoBot webhook/poller mechanics.

## Decisions

### 1. Dual price on the offer, not separate offers

`offers.stars_amount INTEGER NULL`. NULL means the offer is crypto-only. Rationale: one catalog entry per package keeps admin management and shop listing simple; a separate stars-only offer type would duplicate titles/grants in every list. Alternative considered — separate offers per method — rejected for list duplication and double bookkeeping of grants.

### 2. Refactor `invoices` to `(provider, external_id)` instead of a parallel table

New shape: internal `id INTEGER PRIMARY KEY AUTOINCREMENT`, `provider TEXT NOT NULL` (`crypto` | `stars`), `external_id TEXT NOT NULL` (Crypto Pay `invoice_id` stringified, or `telegram_payment_charge_id`), `UNIQUE(provider, external_id)`, remaining columns unchanged (`chat_id`, `offer_id`, `amount`, `asset`, `status`, `created_at`, `paid_at`). For Stars rows `asset = 'XTR'`.

Idempotency: `markPaid` keeps the guarded `pending -> paid` transition keyed by `(provider, external_id)`. For Stars there is no pending phase from Telegram's side, so the `successful_payment` handler inserts a row with `INSERT OR IGNORE` (unique index absorbs duplicate delivery) and only the inserting caller applies the grant — same "only the flipper grants" principle.

Alternative considered — separate `stars_payments` table, no migration. Rejected: purchase history (`/profile`, `/me/purchases`) would need a UNION over two tables, and fulfillment logic would fork.

Migration in `server/db.ts` (existing migration style): create new table, copy rows with `provider='crypto', external_id=CAST(invoice_id AS TEXT)`, drop old, rename. Wrapped in a transaction; runs once guarded by a schema check (column presence).

### 3. Stars flow — bot

- `buy:<id>` callback: offer has `stars_amount` and crypto price → edit message to a method-choice keyboard (`buyc:<id>` crypto / `buys:<id>` stars). Crypto-only offer → current behavior unchanged. (Stars-only offers are representable — crypto stays required in the schema for now; admin UI keeps crypto price required.)
- `buys:<id>`: `ctx.replyWithInvoice(title, description, payload, "XTR", [{ label: title, amount: stars_amount }])` — no `provider_token` for Stars.
- `pre_checkout_query` handler: parse payload `{chatId, offerId}`, answer `ok: true` iff the offer exists and is active; otherwise `ok: false` with an error message.
- `message:successful_payment` handler: `INSERT OR IGNORE` the invoice row (status `paid`, `paid_at` now), and if inserted, apply the grant (credits or subscription) and confirm to the user. Runs inside one transaction via a new `fulfillStarsPayment` function in `server/payments/`.

### 4. Stars flow — Mini App

`POST /invoices` body gains `method?: "crypto" | "stars"` (default `crypto`, backward compatible). Stars path calls Bot API `createInvoiceLink` (via the existing grammY bot instance's `bot.api`, injected into route registration the same way `db` is) and returns `{ payUrl, method: "stars" }`. Frontend calls `WebApp.openInvoice(payUrl)` instead of `openTelegramLink`; on `invoiceClosed` with `status === "paid"` it refetches `/me` to refresh credits. Actual fulfillment still happens in the bot's `successful_payment` handler — single fulfillment path for Stars regardless of where the invoice was opened.

### 5. Signup bonus at row creation

`SIGNUP_BONUS_CREDITS = 10` constant in `server/access/users-store.ts`. `upsertUser`'s INSERT sets `credits = 10` for fresh rows (`ON CONFLICT ... DO UPDATE` leaves existing rows' credits untouched); `ensureUser` (lazy grant path) also inserts with the bonus so a buyer's first contact isn't penalized. Atomic with row creation — no flag column, no race: a row is inserted exactly once.

## Risks / Trade-offs

- [Invoices migration corrupts history on a failed deploy] → migration runs in a transaction with a schema-presence guard; deploy keeps prior release dirs, rollback = repoint symlink (README procedure) — old code reads old schema only if migration never committed.
- [Duplicate `successful_payment` delivery double-grants] → `UNIQUE(provider, external_id)` + grant only on actual insert.
- [User pays Stars for an offer deactivated mid-checkout] → `pre_checkout_query` re-validates and rejects before money moves.
- [Bonus farming via re-registration] → chat_id is stable per Telegram account; deleting the bot chat doesn't delete the row. Accepted residual risk: fresh Telegram accounts.
- [Mini App `invoiceClosed` fires before bot processes `successful_payment`] → frontend refetches `/me` with a short retry so the balance reflects the grant.

## Migration Plan

1. Deploy new release (migration runs at startup inside `server/db.ts` init).
2. Verify `/healthz`, run a live Stars test purchase (smallest offer) and a crypto purchase.
3. Rollback: repoint `current` symlink to previous release. Note: rows created by the new schema are lost to the old code path only if written between deploy and rollback (accepted; window is minutes).

## Open Questions

_None — design approved in conversation (2026-07-14)._
