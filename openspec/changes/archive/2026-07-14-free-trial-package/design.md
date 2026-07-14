# Design: Free trial package

## Context

Access today is credits OR live subscription (`server/access/entitlements.ts`), with admins and payments-disabled mode bypassing the paywall. Credits are a plain integer on `users` with no expiry. Paid grants flow through `offers` → `invoices` → fulfillment. The trial must grant expiring credits with no invoice involvement, claimable once per user from both the bot and the Mini App.

## Goals / Non-Goals

**Goals:**
- One-time-forever trial: 10 generations, expiring 3 days after activation.
- Instant grant with no invoice/provider records.
- Trial credits consumed before paid credits; expired trial credits inert.
- Claim from Mini App BuyScreen and bot `/buy`; status visible in both profiles.

**Non-Goals:**
- No changes to signup bonus, offers, invoices, or fulfillment.
- No admin configuration of trial size/duration (fixed constants).
- No general expiring-credits ledger (FIFO batches, per-grant expiry) — single trial bucket only.
- No expiry notifications/reminders.

## Decisions

### 1. Separate trial bucket on `users`, not expiring rows in a ledger

Three additive columns on `users`:
- `trial_credits INTEGER NOT NULL DEFAULT 0`
- `trial_until INTEGER` (unix seconds)
- `trial_claimed_at INTEGER` (NULL = never claimed; once-forever marker)

Alternative — a credits ledger with per-batch expiry — was rejected: only one expiring grant exists (the trial), and a ledger would force rewriting all credit reads/writes. A dedicated bucket keeps paid credits untouched and expiry a simple predicate (`trial_credits > 0 AND trial_until > now`). Migration uses the existing `try { ALTER TABLE … } catch {}` pattern in `server/db.ts`.

### 2. Claim and consume as atomic conditional UPDATEs

- `claimTrial`: `UPDATE users SET trial_credits = 10, trial_until = unixepoch() + 3*86400, trial_claimed_at = unixepoch() WHERE chat_id = ? AND trial_claimed_at IS NULL` after `ensureUser`. `changes === 1` ⇒ claimed. No read-modify-write race; double-claim impossible even under concurrent requests.
- `consumeTrialCredit`: `UPDATE users SET trial_credits = trial_credits - 1 WHERE chat_id = ? AND trial_credits > 0 AND trial_until > unixepoch()` — mirrors existing `consumeCredit`. Expiry enforced in the same statement, so an expired trial can never be spent.

Constants `TRIAL_CREDITS = 10`, `TRIAL_DAYS = 3` live in `server/access/users-store.ts` next to `SIGNUP_BONUS_CREDITS`.

### 3. Consumption order: subscription → trial → paid credits

`consumeAccess` stays free for subscribers; otherwise it tries `consumeTrialCredit` first and falls back to `consumeCredit`. Trial credits are the ones that expire, so burning them first preserves the user's paid balance — the user-friendly and least-surprising order. `hasAccess` adds the active-trial predicate alongside the existing checks.

### 4. Trial claim is part of the paywall surface

`POST /trial/claim` is gated by `getPaymentsEnabled` exactly like `POST /invoices` (503 when disabled): when payments are off everyone already has access, so a trial is meaningless and offering it would only confuse. Repeat claim returns `409 { error: "trial already claimed" }`. `GET /me` gains an additive `trial: { claimed, active, creditsLeft, until }` object (older clients unaffected).

### 5. Shop surfaces render the trial as a pseudo-offer, not an `offers` row

A real zero-price `offers` row was rejected: it would leak into admin CRUD, invoice creation paths, and Stars validation, all of which assume a payable price. Instead:
- Bot: `offersKeyboard`/`sendOffers` take the caller's `chatId` and prepend a `trial:claim` button when `trial_claimed_at IS NULL`; a callback handler claims and replies.
- Mini App: BuyScreen fetches `/me` alongside offers and renders a free-package card with a claim button while `trial.claimed === false`, reusing the existing success-toast pattern.

## Risks / Trade-offs

- [Trial + signup bonus both grant 10 generations → generous free tier] → Accepted per product decision; signup bonus explicitly unchanged. Constants make later tuning trivial.
- [Users may expect trial credits to survive 3 days if unused] → Expiry shown at claim time and in both profiles (credits left + date).
- [Clock-based expiry uses server time] → Same convention as `subscription_until`; no new risk.
- [`hasAccess` true near expiry but generation finishes after `trial_until`] → `consumeAccess` then falls through to paid credits or no-ops like today's `consumeCredit` on zero balance; a rare free generation at the boundary is acceptable.

## Migration Plan

Additive `ALTER TABLE` columns applied on boot (idempotent try/catch, same as `photo_file_id`). No data backfill; existing users simply have an unclaimed trial. Rollback: deploy previous build — extra columns are ignored.

## Open Questions

_None._
