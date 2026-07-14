# Proposal: Stars-only product creation

## Why

Offers can currently be created without a Stars price (crypto-only). This weakens Telegram Stars adoption — users without crypto cannot purchase crypto-only offers. The business goal is to require every new offer to be purchasable with Stars, ensuring universal access.

## What Changes

- **`stars_amount` becomes required** when creating or updating an offer. Existing offers with NULL `stars_amount` are left untouched (grandfathered) but admin is prompted to migrate them.
- **Admin offer forms** (bot FSM and Mini App) reject creation/update without a valid positive integer Stars price.
- **API validation** enforces non-null `stars_amount` on `POST /api/admin/offers` and `PATCH /api/admin/offers/:id`.
- **BREAKING (admin UX)**: offer creation flow now requires Stars price input; the "skip" option is removed.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `admin-panel`: offer creation and editing forms SHALL enforce `stars_amount` as required. The bot FSM SHALL remove the "skip" path for Stars price. The Mini App form SHALL show `stars_amount` as required with validation.
- `payments`: the `stars_amount` field on an offer SHALL be mandatory for new offers. Existing grandfathered offers with NULL `stars_amount` remain purchasable via crypto only. Updating an offer SHALL require setting a Stars price.

## Impact

- **offers-store.ts**: `createOffer` and `updateOffer` validation — reject NULL `stars_amount`.
- **server/api/routes.ts**: `POST /api/admin/offers` and `PATCH /api/admin/offers/:id` — validate `stars_amount` is present and positive.
- **server/bot/admin-panel.ts**: FSM for new offer — `starsAmount` step becomes required, no skip path. Edit flow — Stars price step added.
- **miniapp/src/screens/AdminScreen.tsx**: `OfferForm` — `starsAmount` field marked required, submit validates it.
- **miniapp/src/lib/api.ts**: types — `starsAmount` non-optional on create/update payloads.
- **payments spec schema**: `OfferInput.starsAmount` becomes `number` (was `number | null`).
- No DB migration needed (column stays nullable; existing NULL rows grandfathered).
