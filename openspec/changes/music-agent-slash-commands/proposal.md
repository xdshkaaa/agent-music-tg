## Why

Music agent currently has no dedicated slash commands — all generation happens through free-text input. Users need convenience commands for common actions: quick generation with a prompt, checking credits, viewing/changing AI model, clearing session, and browsing generation history.

## What Changes

5 new user-facing slash commands for the music agent:

- `/generate <prompt>` — start generation with an inline prompt (bypasses the need to type free text)
- `/credits` — show remaining credits and subscription status (lightweight version of `/profile`)
- `/model [name]` — view or switch the active AI model for generation (user-facing, not admin-only)
- `/reset` — clear pending clarification session if stuck
- `/history` — show last N generated playlists

All commands will be registered in the bot alongside existing ones. A new `generations` DB table is added to track generation history for `/history`.

## Capabilities

### New Capabilities
- `generate-command`: Slash command to start generation with an inline prompt
- `credits-command`: Slash command to view credit/subscription status
- `model-command`: Slash command to view/switch AI model
- `reset-command`: Slash command to clear session state
- `history-command`: Slash command to browse generation history

### Modified Capabilities

None — no existing spec changes.

## Impact

- **server/bot/index.ts**: Register 5 new commands
- **server/bot/generate.ts** (new): `/generate` command handler
- **server/bot/credits.ts** (new): `/credits` command handler
- **server/bot/model.ts** (new): `/model` command handler
- **server/bot/reset.ts** (new): `/reset` command handler
- **server/bot/history.ts** (new): `/history` command handler
- **server/db.ts**: Add `generations` table
- **server/access/users-store.ts** or new store: add generation log queries
