## 1. Server: Fix PATCH validation

- [x] 1.1 Add `parseOptionalStarsAmount` helper in `server/api/routes.ts` that accepts `undefined, null, "", 0` but still rejects negative integers and non-numeric strings
- [x] 1.2 Replace `parseRequiredStarsAmount(b.starsAmount)` with `parseOptionalStarsAmount(b.starsAmount)` in the `PATCH /admin/offers/:id` handler (line 281)
- [x] 1.3 Pass the result through the `starsAmount` patch field: when the parsed value is `undefined` (key not in body) do not include it in the patch object; when `null` or `0`, pass it explicitly for the store layer to handle

## 2. Mini App: Fix form payload

- [x] 2.1 In `AdminScreen.tsx` OfferForm, stop converting `null` DB `starsAmount` to `0` — send `starsAmount` as the raw DB value so the PATCH body reflects what the admin sees
- [x] 2.2 If the admin explicitly clears the starsAmount input to empty/zero, send `starsAmount: null` to signal "clear this field" rather than `0`

## 3. Tests

- [x] 3.1 Create `server/api/offers.test.ts` with test infrastructure (freshDb, buildInitData with admin user)
- [x] 3.2 Add test: PATCH updates asset without starsAmount — should succeed and preserve existing starsAmount
- [x] 3.3 Add test: PATCH with starsAmount = null — accepted
- [x] 3.4 Add test: PATCH with invalid starsAmount (-5, "abc") — rejected with 400
- [x] 3.5 Add test: POST (create) with starsAmount = 0 — still rejected (unchanged behavior)
