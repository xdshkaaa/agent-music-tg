## Context

The bot has a Telegram admin panel (`server/bot/admin-panel.ts`) registered via `registerAdminPanel()` in `server/bot/index.ts`. It shows an inline keyboard with four buttons: Статистика (Stats), Пакеты (Offers), Рассылка (Broadcast), Настройки (Settings). The Настройки screen currently only shows shop info (name, support, about).

AI provider (`active_provider`) and music backend (`active_backend`) are stored in the SQLite `settings` table and managed by helpers in `server/lib/settings.ts`. They are switchable today only via `/provider <id>` and `/backend <id>` bot commands or via the Mini App admin API — neither is available from the Telegram inline menu.

Available providers are enumerated in `server/agent/registry.ts` (`AVAILABLE_PROVIDERS`), available backends in `server/music/registry.ts` (`AVAILABLE_BACKENDS`).

## Goals / Non-Goals

**Goals:**
- Add "Провайдер" and "Источник" buttons to the admin menu inline keyboard
- On tap, show a new inline keyboard with the current active selection highlighted and all available options as buttons
- Tapping an option updates the setting in SQLite and confirms to the admin
- Back button returns to the main admin menu
- The UI shows an emoji indicator (current selection) and a label per option
- Reuse existing `getActiveProviderId`/`setActiveProviderId`/`getActiveBackendId`/`getActiveBackendId` and `AVAILABLE_PROVIDERS`/`AVAILABLE_BACKENDS` — no new data access

**Non-Goals:**
- No new env vars or config
- No changes to the `/provider`/`/backend` commands or Mini App admin API
- No per-provider model selection UI (OpenRouter model, Gemini model, etc.) — that's a future scope
- No credential validation in the admin UI (credentials are validated at call time by `createProvider`)
- No changes to music provider selection flow beyond adding it to the admin menu

## Decisions

**1. Provider/Backend switching as separate sub-menus, not part of Настройки.**
The Настройки (Settings) screen is for shop text content only. Adding provider/backend toggles there would mix concerns. Instead, add dedicated "Провайдер" and "Источник" top-level buttons in the main admin menu alongside the existing four. Each opens a focused selection keyboard.

*Alternative:* merge into Настройки as inline fields — rejected because the settings flow uses a free-text FSM (admin types a value), while provider/backend selection is a button-tap choice.

**2. Selection keyboard: one row per option, active option visually distinguished.**
Each available provider/backend gets a button. The currently active one uses a "success" style (green) with a checkmark in the label. Others use a neutral style. Tapping any button calls `setActiveProviderId`/`setActiveBackendId` and re-renders the selection keyboard to reflect the new active choice.

**3. Back button returns to main admin menu.**
Each selection keyboard has a "Назад" (Back) button that re-sends the main admin menu message. This keeps navigation consistent with the existing admin panel pattern.

**4. No credential check at selection time.**
Credentials are validated at generation time by `createProvider()` in `server/agent/registry.ts` which throws `MissingCredentialError`. The admin panel shows the full list regardless — admins may switch to a provider whose key is not set, and the error surfaces naturally on the next generation attempt.

## Risks / Trade-offs

- **Admin switches to a misconfigured provider** → Next generation attempt fails with `MissingCredentialError`. The admin sees a clear error message and can switch back. Acceptable.
- **Many providers/backends** → Currently 5 providers and 2 backends, all fit on small Telegram keyboards. If more are added, pagination may be needed — not a concern now.
- **State mismatch between admin panel and Mini App** → Both read/write from the same SQLite `settings` table, so they're always in sync.
