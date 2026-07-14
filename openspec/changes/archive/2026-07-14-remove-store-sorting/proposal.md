## Why

The sorting feature (Дешевле, Дороже, Популярное) adds unnecessary UI complexity for no practical benefit. The store typically has a small number of offers — the category filter (Все / Генерации / Подписка) and text search already let users find what they need. The "Популярное" sort is effectively a no-op since only active offers are returned from the API, making all items equivalent under that criterion.

## What Changes

- Remove the `SortMode` type, `SORTS` array, and `sort` state from `BuyScreen.tsx`.
- Remove the `amountNumber` helper (only used by sorting).
- Remove the sorting logic from the `visible` useMemo — offers will be displayed in server-returned order (by `id`).
- Remove the `<Segmented>` component used as the sort switcher in the UI.
- Remove the `Segmented` import. Check if `Segmented` is used elsewhere; if not, delete the component.

## Capabilities

### New Capabilities

*(None — this is a removal, not an addition.)*

### Modified Capabilities

*(No existing specs in `openspec/specs/` to modify.)*

## Impact

- **Modified:** `miniapp/src/screens/BuyScreen.tsx` — remove `SortMode`, `SORTS`, `sort` state, `amountNumber`, sorting logic, and the `<Segmented>` sort control.
- **Possibly deleted (if unused elsewhere):** `miniapp/src/components/Segmented.tsx`.
- **No server changes.** Sorting was entirely client-side.
