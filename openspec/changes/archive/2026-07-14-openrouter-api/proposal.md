## Why

Admins currently switch AI provider (`/provider <id>`) and music backend (`/backend <id>`) via raw bot commands only. The Telegram admin panel inline keyboard (Stats / Offers / Broadcast / Settings) has no UI for these toggles, forcing admins to memorize command syntax. Adding native provider/backend selection to the admin menu makes the bot administration accessible without remembering commands.

## What Changes

- Add "Провайдер" (Provider) button to the admin panel menu
- Add "Источник" (Backend) button to the admin panel menu
- Create inline keyboard flows for selecting active provider and music backend from the available options
- Provider/backend settings page shows current active selection and lets admin switch with a single tap
- Maintain the existing `/provider` and `/backend` commands (backward compatible)

## Capabilities

### New Capabilities
- `admin-provider-switch`: Inline-keyboard flow in the Telegram admin panel for viewing and switching the active AI provider (OpenAI, Anthropic, OpenRouter, Ollama, Opencode)
- `admin-backend-switch`: Inline-keyboard flow in the Telegram admin panel for viewing and switching the active music backend (YouTube Music, SoundCloud)

### Modified Capabilities
*(None — no spec-level requirement changes to existing capabilities)*

## Impact

- `server/bot/admin-panel.ts`: Add provider/backend selection callbacks and keyboard builders
- `server/bot/index.ts`: Provider and backend commands remain unchanged
- `server/lib/settings.ts`: Reuse existing `getActiveProviderId`/`setActiveProviderId`/`getActiveBackendId`/`setActiveBackendId`
- `server/agent/registry.ts` / `server/music/registry.ts`: Reuse existing `AVAILABLE_PROVIDERS` / `AVAILABLE_BACKENDS` constants
