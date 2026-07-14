## Why

Users report that after claiming the free trial pack (10 generations for 3 days) — either via the bot `/buy` or the Mini App BuyScreen — the credits don't appear to be credited. The claim confirmation is shown, but the account balance doesn't visibly change, and the trial grant sometimes doesn't function as expected.

Three concrete bugs cause or exacerbate this:

1. **Bot trial:claim handler skips the payments-enabled guard** — unlike the API endpoint, the bot callback grants the trial even when payments are disabled, making the trial meaningless (everyone already has free access).
2. **Stale bot keyboard after claiming** — the trial button remains visible in the old message even after successful claim, inviting repeated useless clicks.
3. **Mini App BuyScreen doesn't refresh after claiming** — after `claimTrial()` succeeds, the offer list is never re-fetched, so the user sees stale state.

## What Changes

- Add `paymentsEnabled` guard to the bot `trial:claim` callback handler, matching the API endpoint behaviour
- Edit the original message's inline keyboard after successful claim to remove the trial button (or disable it)
- Call `refresh()` after successful Mini App claim so the BuyScreen reflects the new state
- Ensure the bot `/profile` and Mini App ProfileScreen visibly surface trial credits so the user sees what they received

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `generation-access`: bot trial:claim handler must respect payments-disabled mode, and the keyboard must update after claim to reflect claimed state
- `payments`: Mini App BuyScreen must refresh its full state after a successful trial claim

## Impact

- `server/bot/shop.ts`: add guard before `claimTrial`, add keyboard edit after success
- `miniapp/src/screens/BuyScreen.tsx`: call `refresh()` after successful `claimTrial()`
- No DB changes, no new endpoints, no new dependencies
