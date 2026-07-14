## Context

Current state:
- Offers have `stars_amount` (nullable INTEGER) — optional field added by `stars-payments-free-credits`
- Admin can create an offer with only crypto price (starsAmount = null)
- Bot FSM for offer creation has a "skip" path for Stars price (send `-`)
- Mini App `OfferForm` shows Stars price as optional (placeholder: "пусто — без Stars")
- API `POST /admin/offers` and `PATCH /admin/offers/:id` accept `starsAmount: null`
- `offers-store.ts` validation (`assertValidStarsAmount`) allows `null`/`undefined`

Goal: enforce that every new offer MUST have a Stars price. Existing NULL-star offers are grandfathered — they remain purchasable via crypto only but admin is steered toward migrating them.

## Goals / Non-Goals

**Goals:**
- `createOffer` rejects input without a valid positive integer `starsAmount`
- `updateOffer` requires setting a `starsAmount` on the patched offer
- Bot admin FSM removes the "skip" (`-`) path — Stars price step requires positive integer
- Mini App `OfferForm` marks Stars price as required and validates non-empty
- API endpoints validate `starsAmount` is present and positive for both create and update
- Existing offers with NULL `starsAmount` remain functional — listed, purchasable via crypto, toggleable

**Non-Goals:**
- No DB migration — column stays nullable, grandfathering is application-level
- No change to `listActiveOffers`, `getOffer`, `deleteOffer`, `setOfferActive`
- No change to user-facing shop or buy flows
- No retroactive enforcement on existing offers

## Decisions

1. **Grandfather existing NULL-stars offers** rather than forcing a migration.
   *Rationale:* Existing crypto-only offers represent real products with real pricing. Forcing a Stars price on them would require a business decision per offer. The constraint applies forward only.

2. **Update path also requires starsAmount** — when editing an existing NULL-stars offer, admin must provide a Stars price.
   *Rationale:* Consistent with the goal of Stars-only creation. If admin touches an old offer, they should modernize it. To keep an offer crypto-only they would need to delete and recreate — which is intentional friction.

3. **`OfferInput.starsAmount` becomes effectively required** (type narrowed from `number | null | undefined` to `number` on creation, `number` on update path).
   *Rationale:* Remove ambiguity at the type level. The `assertValidStarsAmount` function is revised to reject `null`/`undefined` for new offers.

4. **Bot FSM: remove `-` skip branch**; the step asks for Stars price as mandatory input.
   *Rationale:* Simplest UX change — one branch deleted. The flow stays the same length.

5. **Mini App: change placeholder + add `required`** on the Stars input; clear the "null" fallback in `EMPTY_OFFER`.
   *Rationale:* Minimal React change; type narrowing happens at the API client level.

## Risks / Trade-offs

- **Admin friction**: Admin cannot create a crypto-only offer anymore. This is intentional per business goal.
- **Grandfathered offers grow stale**: Old NULL-stars offers persist indefinitely. Mitigation: the admin offer list already shows a visual difference (`/ ⭐` suffix missing); admin can choose to migrate them.
- **Existing tests break** because test `createOffer` calls omit `starsAmount`. Mitigation: update test calls to pass `starsAmount: 10` (or similar valid value).
- **Downstream consumers**: any code calling `createOffer` without `starsAmount` will break. Only test files and API routes call it — both are in this change's scope.
