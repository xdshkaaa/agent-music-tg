## 1. Remove unused state

- [x] 1.1 Delete the `confirmDeleteId` state declaration and its `useState` import line in `OffersPanel` (line 127)
- [x] 1.2 Remove `setConfirmDeleteId(null)` from the `remove()` function (line 141)
- [x] 1.3 Replace the conditional delete-confirmation UI (lines 159–166) with a single button that calls `remove(o)` directly
- [x] 1.4 Remove `setConfirmDeleteId(null)` from the "Нет" button handler

## 2. Verify

- [x] 2.1 Run `bun run build:miniapp` — build must pass with no errors
- [x] 2.2 Run `bun run typecheck` — no type errors in miniapp (pre-existing server errors unrelated)
