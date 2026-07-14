# Proposal: Telegram Stars payments + free signup credits

## Why

Today the only way to pay is CryptoBot (crypto), which excludes users without crypto wallets; Telegram Stars is the native in-app payment method and removes that friction. New users also have no way to try the product before paying — a one-time free allowance of 10 generations lets them experience value before buying.

## What Changes

- Offers gain an optional second price in Telegram Stars (`stars_amount`); the existing crypto price stays as-is. An offer with both prices lets the buyer choose the payment method.
- Bot `/buy` flow: offers with both prices show a payment-method choice; Stars path uses Bot API `sendInvoice` with currency `XTR`, `pre_checkout_query` validation, and `successful_payment` fulfillment.
- Mini App purchase flow: `POST /invoices` accepts `method: "crypto" | "stars"`; Stars path returns an invoice link (Bot API `createInvoiceLink`) that the frontend opens via `WebApp.openInvoice`.
- **BREAKING (internal schema)**: `invoices` table refactored from crypto-invoice-id primary key to internal autoincrement `id` + `provider` (`crypto` | `stars`) + `external_id`, with a unique index on `(provider, external_id)` preserving idempotent fulfillment. Existing rows migrated.
- New users receive a one-time signup bonus of 10 generation credits, granted atomically when their user row is first created.
- Admin offer form (Mini App AdminScreen + bot admin panel) gains an optional "Stars price" field.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `payments`: add Telegram Stars as a second payment provider — dual-price offers, method selection, Stars invoice creation in bot and Mini App, idempotent fulfillment keyed by `(provider, external_id)`.
- `generation-access`: new users are granted 10 free generation credits exactly once at first contact (bot `/start` or first Mini App auth).
- `admin-panel`: offer management supports setting/clearing the optional Stars price.

## Impact

- Server: `server/payments/` (offers-store, invoices-store, purchase, fulfillment, new stars module), `server/bot/shop.ts`, new bot payment handlers, `server/access/users-store.ts`, `server/api/routes.ts`, DB migration in `server/db.ts`.
- Mini App: `BuyScreen.tsx` (method choice, `openInvoice`), `AdminScreen.tsx` (Stars price field), `lib/api.ts`, `lib/telegram.ts`.
- No new external dependencies; uses existing grammY Bot API client. CryptoBot flow untouched.
- Data migration of `invoices` table on deploy (existing paid/pending rows preserved).
