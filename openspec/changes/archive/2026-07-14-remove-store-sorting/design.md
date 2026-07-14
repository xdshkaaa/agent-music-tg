## Context

`BuyScreen.tsx` is the sole Mini App storefront screen. It currently has three filtering/sorting dimensions: text search, category filter (Все / Генерации / Подписка), and a sort toggle (Дешевле / Дороже / Популярное). The sort dimension is unnecessary: the store has few offers, the category filter already narrows them, and "Популярное" is a no-op since the API only returns active offers (all have `active: true`). Removing it simplifies the UI and removes the `Segmented` component dependency.

## Goals / Non-Goals

**Goals:**
- Remove the sort UI and its associated state/logic from `BuyScreen.tsx`.
- Remove `Segmented.tsx` if no other component imports it.
- Keep category filter and text search working as before.
- Keep the typecheck and tests green.

**Non-Goals:**
- No server changes — sorting was entirely client-side.
- No other UI refactoring beyond removing the sort control.

## Decisions

1. **Delete `amountNumber` helper** — it exists only for the price-sort comparisons. The offer amount is already displayed verbatim; no other code path reads a numeric amount.
2. **Keep category + search** — they are independently useful and have no overlap with the removed sort.
3. **Delete `Segmented.tsx` conditionally** — if it's not imported anywhere else, remove the file entirely. No need to keep a dead component.

## Risks / Trade-offs

- **Segmented component used elsewhere** → If another screen imports `Segmented`, we keep the file but remove the unused import from `BuyScreen`. Low risk — a grep will confirm.
- **No server changes needed** — the API returns offers in `ORDER BY id`. After removal, the client preserves that order. No behavioral regression.
