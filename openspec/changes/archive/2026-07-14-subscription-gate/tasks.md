## 1. Database Migration

- [x] 1.1 Add `required_channels` table migration in `server/db.ts` with columns: `id INTEGER PK AUTOINCREMENT`, `channel_id INTEGER NOT NULL UNIQUE`, `username TEXT`, `invite_link TEXT`, `title TEXT NOT NULL`, `added_by INTEGER`, `created_at INTEGER NOT NULL DEFAULT (unixepoch())`
- [x] 1.2 Add `channel_memberships` table migration with columns: `chat_id INTEGER`, `channel_id INTEGER`, `is_member INTEGER NOT NULL DEFAULT 0`, `checked_at INTEGER NOT NULL DEFAULT (unixepoch())`, `PRIMARY KEY (chat_id, channel_id)`

## 2. Data Access Layer — Required Channels Store

- [x] 2.1 Create `server/access/channel-gate-store.ts` — function: `listRequiredChannels(db): { channelId, username, inviteLink, title, addedBy, createdAt }[]`
- [x] 2.2 Add `addRequiredChannel(db, channelId, title, username?, inviteLink?, addedBy)` with UNIQUE constraint handling
- [x] 2.3 Add `removeRequiredChannel(db, channelId)` — deletes the channel and all cached memberships for it
- [x] 2.4 Add `getRequiredChannelsCount(db): number` (quick way to check if gate is active)
- [x] 2.5 Add `setSubscriptionGateEnabled(db, enabled: boolean)` and `isSubscriptionGateEnabled(db): boolean` using `settings` table key `subscription_gate_enabled`

## 3. Data Access Layer — Membership Cache

- [x] 3.1 Add `getCachedMemberships(db, chatId): Map<number, boolean>` — returns all cached channel memberships for a user
- [x] 3.2 Add `setCachedMembership(db, chatId, channelId, isMember)` — upserts membership check result with current timestamp
- [x] 3.3 Add `clearChannelMemberships(db, channelId)` — deletes all cached entries for a channel (used when channel is removed from required list)
- [x] 3.4 Add `isMembershipCacheFresh(checkedAt, ttlSeconds=300): boolean` utility

## 4. Bot Middleware — Channel Subscription Gate

- [x] 4.1 Create `server/bot/channel-subscription-gate.ts` — middleware that runs after `allowlistGate`
- [x] 4.2 Implement gate logic: check if gate is enabled, load required channels, check cached memberships, call `getChatMember` for stale/uncached channels with rate-limit fallback
- [x] 4.3 Implement gate message: explanation text + inline buttons per channel (opens invite link or channel) + "✅ Я вступился" callback button (`subgate:check`)
- [x] 4.4 Handle `subgate:check` callback query — re-check all channels, update message to success or still-blocked state
- [x] 4.5 Track gate message IDs per chat (in memory Map) to edit existing gate message instead of sending new ones on repeated blocked interactions
- [x] 4.6 Register middleware in `server/bot/index.ts` — `bot.use(allowlistGate(db))` then `bot.use(channelSubscriptionGate(db))`

## 5. Admin Panel — Channel Gate Section

- [x] 5.1 Add "Channel Gate" button to admin menu in `adminKeyboards` in `server/bot/admin-panel.ts`
- [x] 5.2 Implement `showChannelGate(ctx, db)` — list required channels with title, username, invite link + toggle gate on/off button + Add / (per-channel) Remove buttons
- [x] 5.3 Implement `adminChannelAddFsm` — FSM that asks admin for invite link or @username, resolves via `getChat`, confirms with channel title, saves to DB
- [x] 5.4 Implement channel removal flow — confirm then delete from `required_channels` + clear memberships
- [x] 5.5 Implement gate toggle — flips `subscription_gate_enabled` setting and updates the message
- [x] 5.6 Add FSM kind `admin_add_channel` to the admin FSM handler in `handleAdminText` for capturing channel input
- [x] 5.7 Register all new callback data patterns (`admin:channel-gate`, `admin:channel-gate:add`, `admin:channel-gate:del:<channelId>`, `admin:channel-gate:toggle`) in the admin callback router

## 6. Error Handling & Edge Cases

- [x] 6.1 Handle bot not being admin of a required channel — catch 400 error from `getChatMember`, show "channel unavailable" gate message
- [x] 6.2 Handle Telegram rate limit (429) — fall back to cached membership value; if no cache exists, treat as "not subscribed"
- [x] 6.3 Handle invite link expiry during add flow — show error if `getChat` can't resolve the link
- [x] 6.4 Handle case where all required channels are removed while gate is enabled — middleware passes through silently
