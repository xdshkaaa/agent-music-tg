## 1. Admin panel — provider selection

- [x] 1.1 Add `showProviderSelection(ctx, db)` function in `server/bot/admin-panel.ts` that reads active provider via `getActiveProviderId()`, builds an inline keyboard with one button per `AVAILABLE_PROVIDERS` (active option styled with `"success"` + checkmark), and includes a "Назад" button
- [x] 1.2 Register `admin:provider` callback query in `registerAdminPanel` that calls `showProviderSelection`
- [x] 1.3 Register `admin:provider:set:<id>` callback query (regex) that calls `setActiveProviderId()` and re-renders the selection keyboard
- [x] 1.4 Add "Провайдер" button to the main `menuKeyboard()`

## 2. Admin panel — backend selection

- [x] 2.1 Add `showBackendSelection(ctx, db)` function in `server/bot/admin-panel.ts` that reads active backend via `getActiveBackendId()`, builds keyboard per `AVAILABLE_BACKENDS`, active option styled, includes "Назад"
- [x] 2.2 Register `admin:backend` callback query that calls `showBackendSelection`
- [x] 2.3 Register `admin:backend:set:<id>` callback query (regex) that calls `setActiveBackendId()` and re-renders
- [x] 2.4 Add "Источник" button to the main `menuKeyboard()`

## 3. Verification

- [x] 3.1 Run `openspec validate openrouter-api` to validate all artifacts
- [x] 3.2 Run `bun test` to verify no regressions
