## Context

The `PATCH /admin/offers/:id` handler was designed alongside `POST /admin/offers` with a shared assumption that `starsAmount` is always required. When `stars_amount` was added as a nullable column to the `offers` table (migration), the PATCH validation was not updated to match the store layer (`offers-store.ts`), which already treats `starsAmount` as optional for updates.

The Mini App admin form (`AdminScreen.tsx`) compounds this by converting `null` DB values to `0` before sending, which triggers the server-side rejection.

## Goals / Non-Goals

**Goals:**
- Allow saving offers with any valid Crypto Pay asset via the admin panel
- Make PATCH handler validation consistent with the store layer (partial updates)
- Add automated test coverage for the bug fix

**Non-Goals:**
- Changing the offer data model or database schema
- Adding new admin panel features
- Changing how `POST /admin/offers` (creation) works — `starsAmount` remains required for new offers

## Decisions

1. **Make `starsAmount` optional in PATCH validation** — Use a separate `parseOptionalStarsAmount` function that accepts `undefined`, `null`, empty string, and `0`. The store layer already guards: `if (patch.starsAmount !== undefined)`. This is the minimal, safe fix.

2. **Fix Mini App form to omit unchanged `starsAmount`** — Instead of always sending `starsAmount: o.starsAmount ?? 0`, track whether the user touched the starsAmount input and only include it in the PATCH body if changed. This avoids sending `0` for legacy `null` values.

3. **No spec file needed** — This is a pure implementation bug fix; no capability behavior or requirement changes.

## Risks / Trade-offs

- **Risk: Admin saves a legacy offer without noticing `starsAmount = null`** → After the fix, the PATCH simply preserves the existing `starsAmount`. The offer remains sellable only via crypto, which is correct — Stars was never set for that offer.
- **Risk: `parseOptionalStarsAmount` is too permissive** → The function should reject non-numeric strings and negative numbers, the same validation as `parseRequiredStarsAmount` minus the "required" check.
