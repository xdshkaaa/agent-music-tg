## Why

Admins cannot save offers with non-USDT assets (e.g. TON, BTC) via the Mini App admin panel. The save silently fails with a `400 Bad Request` because the PATCH endpoint unconditionally validates `starsAmount` as required, rejecting `0`, `null`, or `undefined` — values that legacy offers (created before the `stars_amount` migration) carry in the database.

## What Changes

1. **PATCH `/admin/offers/:id`** — make `starsAmount` validation optional, consistent with the store layer that already treats it as a partial patch field.
2. **Mini App admin offer form** — stop sending `starsAmount: 0` for legacy offers; only include it in the PATCH body when the user explicitly set a value.
3. **Add E2E-style test coverage** for the PATCH endpoint to prevent regression.

## Capabilities

### New Capabilities
- `admin-offer-update`: Partial-update API behavior for admin offer management — PATCH endpoint accepts optional starsAmount, preserving existing value when omitted.

### Modified Capabilities
- _(none — no spec-level requirement changes, only implementation fixes)_

## Impact

- `server/api/routes.ts` — PATCH offer handler validation logic
- `miniapp/src/screens/AdminScreen.tsx` — offer edit form payload construction
- `server/api/routes.test.ts` or similar — new PATCH endpoint tests
