# Proposal: Free trial package — 10 generations for 3 days, no invoices

## Why

New users can currently only get paid access through CryptoBot or Telegram Stars invoices; beyond the one-time signup bonus there is no explicit, time-boxed way to try the product. A claimable free trial — 10 generations valid for 3 days, granted instantly with no invoice — lowers the barrier to first value and creates urgency to convert.

## What Changes

- New one-time **trial grant**: 10 generation credits that expire 3 days after activation (whichever runs out first ends the trial). Claimable exactly once per Telegram account, forever.
- Trial is granted **directly, without any invoice** — no `invoices` row, no payment provider involved.
- Claim surfaces: Mini App BuyScreen (free package card with a "Забрать" button) and bot `/buy` (free package button above paid offers). Both hide once claimed.
- Access check (`hasAccess`) and consumption (`consumeAccess`) account for trial credits: an active trial grants access; trial credits are consumed before paid credits; expired trial credits are inert.
- `GET /me` gains an additive `trial` object; new `POST /trial/claim` endpoint.
- Bot `/profile` and Mini App ProfileScreen show active trial status (credits left, expiry).
- Existing signup bonus (10 non-expiring credits on first contact) is unchanged; the trial is a separate, explicitly claimed grant.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `generation-access`: trial credits (with expiry) participate in the access check and are consumed before paid credits; one-time-forever claim semantics.
- `payments`: shop surfaces (bot `/buy`, Mini App BuyScreen) offer a free claimable trial package that bypasses the invoice flow entirely.

## Impact

- Server: `server/db.ts` (three additive `users` columns: `trial_credits`, `trial_until`, `trial_claimed_at`), `server/access/users-store.ts` (claim/consume helpers), `server/access/entitlements.ts` (access check + consumption order), `server/api/routes.ts` (`/me` extension, `POST /trial/claim`), `server/bot/shop.ts` (`/buy` button, `trial:claim` callback, `/profile` line).
- Mini App: `lib/api.ts` (`MeResponse.trial`, `claimTrial()`), `BuyScreen.tsx` (free package card), `ProfileScreen.tsx` (trial status).
- No new dependencies; no invoice schema changes; additive DB migration only.
