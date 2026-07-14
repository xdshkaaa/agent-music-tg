## Context

The free trial package (10 generations, 3-day access) was implemented in `free-trial-package`. The core grant logic (`claimTrial` atomic UPDATE in `users-store.ts`) is correct. Three distinct bugs were discovered in the UX layer:

1. **Bot callback skips payments guard** (`server/bot/shop.ts:131-138`): the API endpoint (`routes.ts:134`) checks `getPaymentsEnabled(…)` before granting, but the bot `trial:claim` handler does not. When payments are disabled the trial is a no-op (everyone has free access), but the handler still claims it and shows "activated" — inconsistent and misleading.

2. **Stale bot keyboard after claim** (`server/bot/shop.ts:131-138`): the handler sends a new reply message but never edits the original inline keyboard. The `trial:claim` button remains visible, inviting repeated useless clicks that each reply "already activated."

3. **Mini App BuyScreen doesn't refresh after claim** (`miniapp/src/screens/BuyScreen.tsx:93-107`): the success path calls `setTrial(result.trial)` and shows a toast, but never calls `refresh()`. The offers list stays stale (e.g., free card disappears only via local state, but `/me` isn't re-fetched).

Additionally, the bot `/profile` and Mini App ProfileScreen correctly display trial status — the user *can* see trial credits after claiming. The "nothing credited" perception is caused by the stale UX, not by a DB-level grant failure.

## Goals / Non-Goals

**Goals:**
- Bot `trial:claim` honours `paymentsEnabled` like the API endpoint does
- Bot inline keyboard updates after claim so the trial button disappears
- Mini App BuyScreen re-fetches state after successful claim
- All changes are minimal, testable, and add no new DB columns or endpoints

**Non-Goals:**
- No changes to the core `claimTrial` / `consumeTrialCredit` / `trialActive` logic (those are correct)
- No changes to the API endpoint (already correct)
- No expiry notifications or trial reminders

## Decisions

### 1. Bot payments guard — gate before claiming, same pattern as API

The API handler wraps the claim in `if (!getPaymentsEnabled(db, env.paymentsEnabled))` → 503. The bot handler should do the same: check `env.paymentsEnabled` (or use `getPaymentsEnabled`) before calling `claimTrial`. If payments are disabled, reply with the same 503-style message used elsewhere (e.g., `ctx.reply("Магазин временно недоступен.")`) and do NOT claim.

Alternative — silently skip the trial button at keyboard-build time when payments are off. Rejected: `offersKeyboard` already has access to `db` but not to `env.paymentsEnabled` directly; threading it through would touch more code. A guard in the handler is the minimal, local fix.

### 2. Bot keyboard update — edit the original message markup

After a successful claim, call `ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() })` on the original message (passed via `ctx.callbackQuery.message`). This removes the trial button from the stale message without sending a new one. The `offersKeyboard` helper can be reused with the now-claimed user to generate the correct fresh keyboard.

For the `else` branch (already claimed), no edit needed — the stale button will be gone on the next `/buy`.

### 3. Mini App refresh — call `refresh()` after setTrial/setTrialSuccess

After `claimTrial()` succeeds, the BuyScreen should call `void refresh()` to re-fetch `/me`, `/offers`, and `/purchases`. This ensures the free card disappears (via `trial.claimed === true` from the re-fetched `/me`) and the offers list is up to date.

Alternative — inline `refresh()` as `api.me().then(me => setTrial(me.trial)).catch(...)`. Rejected: `refresh()` is already the canonical re-fetch function; duplicating its logic fragments the refresh path. Calling `refresh()` after `setTrial(result.trial)` is safe — React will batch both state updates.

## Risks / Trade-offs

- [Bot keyboard edit may fail if original message too old] → `ctx.editMessageReplyMarkup` can throw if the message is >48h old. Wrap in try/catch; on failure, the user still needs to re-send `/buy`.
- [Mini App double-refresh on error path] → The existing `catch` in `claimTrial` already calls `void refresh()`. After the fix, success also calls `void refresh()` — two refreshes in quick succession is harmless (cancelled by React strict mode in dev, idempotent in prod).
