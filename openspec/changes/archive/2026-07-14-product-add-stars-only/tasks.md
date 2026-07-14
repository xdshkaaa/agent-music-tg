## 1. Offers-store validation

- [x] 1.1 Revise `assertValidStarsAmount` to reject `null`/`undefined` (throws `InvalidStarsAmountError`)
- [x] 1.2 Update `OfferInput.starsAmount` type — remove `null` from union; make it `number`
- [x] 1.3 Update `createOffer` — remove `?? null` fallback on `starsAmount`; call-site must provide valid number
- [x] 1.4 Update `updateOffer` — enforce non-null `starsAmount` in the merged patch; reject if resolved to null

## 2. API route validation

- [x] 2.1 Update `POST /api/admin/offers` — validate `starsAmount` is present and positive; reject if null/missing
- [x] 2.2 Update `PATCH /api/admin/offers/:id` — validate `starsAmount` is present and positive; reject if null/missing
- [x] 2.3 Rename `parseStarsAmount` to `parseRequiredStarsAmount` — reject null/undefined

## 3. Bot admin panel (FSM)

- [x] 3.1 Remove `-` skip path from `starsAmount` step in `handleAdminText` — only accept positive integer
- [x] 3.2 Update prompt text from "или `-`, если без Stars" to remove the skip instruction
- [x] 3.3 Remove `draft.starsAmount ? ... : null` fallback in `grantAmount` step — always pass `Number(draft.starsAmount)`

## 4. Mini App admin form

- [x] 4.1 Change `EMPTY_OFFER.starsAmount` from `null` to a default value (e.g. `10`)
- [x] 4.2 Change Stars input placeholder from "пусто — без Stars" to "Цена в Stars ⭐" (required)
- [x] 4.3 Add `required` attribute to Stars input element
- [x] 4.4 Remove null-handling in `onChange` — always set `Number(raw)`; reject empty input at form level

## 5. Tests

- [x] 5.1 Update `createOffer` calls in `payments.test.ts` to include `starsAmount`
- [x] 5.2 Add test: `createOffer` with null `starsAmount` throws `InvalidStarsAmountError`
- [x] 5.3 Add test: `updateOffer` with null `starsAmount` on existing offer throws
- [x] 5.4 Add test: `updateOffer` with null `starsAmount` on grandfathered (existing NULL) offer throws
- [x] 5.5 Verify grandfathered offer with NULL `starsAmount` still listed, purchasable via crypto
- [x] 5.6 Update `invoices.test.ts` and `shop.test.ts` calls to include `starsAmount`
