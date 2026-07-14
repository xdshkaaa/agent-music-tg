## 1. Strip sorting from BuyScreen.tsx

- [x] 1.1 Remove `SortMode` type, `SORTS` array, and `sort` state from `BuyScreen.tsx`
- [x] 1.2 Remove `amountNumber` helper function
- [x] 1.3 Remove sorting logic from the `visible` useMemo — keep only category filter + search
- [x] 1.4 Remove `<Segmented>` JSX block
- [x] 1.5 Remove `Segmented` import

## 2. Clean up Segmented component if unused

- [x] 2.1 Grep for `Segmented` imports across `miniapp/src/`; if unused, delete `Segmented.tsx`

## 3. Verify

- [x] 3.1 Run typecheck in `miniapp/` to confirm no compilation errors
- [x] 3.2 Run `bun test` in project root
