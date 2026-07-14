## Why

Currently, the bot has no way to require users to join Telegram channels before using it. This limits the bot owner's ability to grow their channel audience and monetize through channel-based distribution. A channel subscription gate solves this — only users subscribed to specified channels can interact with the bot, and the required channels are configurable at runtime through the admin panel.

## What Changes

- Add `required_channels` database table to store channels that users must join before bot access
- Add a check in the bot middleware that verifies membership in all required channels before allowing interaction
- Add a "subscription gate" screen that shows users which channels they need to join (with invite links) and a "I joined" button to re-check
- Add admin panel UI to manage required channels (add, remove, list)
- Add `subscription_checked_at` column to `allowlist` (or a separate tracking table) to rate-limit membership checks against Telegram API

## Capabilities

### New Capabilities
- `required-channels`: Storage, management, and membership verification of Telegram channels that gate bot access — admin CRUD for channel entries (channel ID, title, invite link), middleware enforcement, and user-facing join prompts.

### Modified Capabilities
- *(none — no existing specs to modify)*

## Impact

- **Database**: New `required_channels` table, new column on `allowlist` or new tracking table
- **Bot middleware**: `allowlistGate` modified or new gate added after it
- **Admin panel**: New section "Required Channels" with add/remove/list
- **Telegram API calls**: `getChatMember` calls for each required channel per user (needs rate-limit awareness)
- **Affected files**: `server/db.ts`, `server/bot/middleware.ts`, `server/bot/admin-panel.ts`, `server/access/`, admin API routes
