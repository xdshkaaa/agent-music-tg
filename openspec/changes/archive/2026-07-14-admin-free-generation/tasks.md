## 1. Entitlements — admin bypass

- [x] 1.1 Add `isAdmin` import from `access-control` in `entitlements.ts`
- [x] 1.2 Modify `hasAccess()` to return `true` when `isAdmin(db, chatId)` is true
- [x] 1.3 Modify `consumeAccess()` to early-return when `isAdmin(db, chatId)` is true
- [x] 1.4 Update existing entitlements tests with admin-bypass scenarios
