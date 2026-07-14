## Context

The bot currently uses an `allowlist`-based gate: only `chat_id`s in the `allowlist` table can interact. There is no mechanism to require users to join Telegram channels before accessing the bot. Telegram's Bot API provides `getChatMember` to check a user's membership status in a channel, but this endpoint has rate limits (30 calls/second per bot). The admin panel already supports FSM-based flows.

The goal is to add an optional channel subscription gate: if the admin configures required channels via the admin panel, the bot blocks interaction until the user has joined all required channels.

## Goals / Non-Goals

**Goals:**
- Store required channels in the database (channel ID, invite link, title, added by)
- Middleware that blocks bot access until user joins all required channels
- Gate message with invite links and a "I joined" (✅ Я вступился) button
- Admin panel section: list, add, remove required channels
- Membership status caching with TTL to avoid Telegram API rate limits

**Non-Goals:**
- Detect when user *leaves* a channel mid-session (checked on next interaction only)
- Gate the Mini App / HTTP API via channel membership (only the bot entry point is gated)
- Complex channel discovery or private channel invite link resolution

## Decisions

### 1. Separate middleware vs. integrating into `allowlistGate`

**Decision**: New `channelSubscriptionGate` middleware, registered after `allowlistGate`.

**Rationale**: Separation of concerns — the allowlist controls *who* can access the bot at all; the subscription gate controls an additional *condition* on top. This makes both easier to reason about, test, and disable independently.

### 2. Membership caching strategy

**Decision**: Store last check result in `allowlist` table (new `subscription_checked_at` column) plus a separate `channel_memberships` table for per-channel details.

**Schema**:
- `required_channels`: `id INTEGER PK`, `channel_id INTEGER NOT NULL UNIQUE`, `username TEXT`, `invite_link TEXT`, `title TEXT`, `added_by INTEGER`, `created_at INTEGER`
- `channel_memberships`: `chat_id INTEGER`, `channel_id INTEGER`, `is_member INTEGER`, `checked_at INTEGER`, `PRIMARY KEY (chat_id, channel_id)`

**TTL**: 5 minutes. If `checked_at < now - 300s`, re-check via `getChatMember`. This prevents hitting rate limits while keeping checks reasonably fresh.

### 3. Rate-limit safety

**Decision**: If `getChatMember` fails with a rate-limit error (429), fall back to the last cached result. If no cache exists for that channel, treat as "not subscribed" (strict fail-closed).

**Rationale**: Fail-closed is safer than fail-open for a security gate. The admin will see the channel list in the panel and can verify the bot is in the channel.

### 4. Bot must be an admin of required channels

**Decision**: The bot must be an administrator of each required channel (required by `getChatMember` for channels with >50 members and all private channels). The admin panel will warn if the bot is not in the channel.

**Rationale**: Telegram API requirement — `getChatMember` works for channels only if the bot is an admin.

### 5. "I joined" flow

**Decision**: A callback button `subgate:check` triggers an immediate re-check of all required channels. No cooldown on this button (user explicitly asked).

### 6. Gate message design

**Decision**: A single message with:
- Explanation text ("To use the bot, subscribe to these channels:")
- One inline button per channel (with 🔗 icon) that opens the invite link
- One "✅ I joined" button at the bottom
- If already subscribed → normal bot response

The gate message replaces the normal bot response for the first interaction; subsequent messages during gate state keep showing the same gate message (edit it to avoid spam).

### 7. Admin panel integration

**Decision**: New admin panel section "Channel Gate" reached from the main admin menu. Sub-sections:
- List required channels (with member count + bot status)
- Add channel (FSM: ask for invite link or username → resolve to channel ID via `getChat` → confirm → save)
- Remove channel (confirm then delete)
- Toggle gate on/off

## Risks / Trade-offs

- **[Rate Limits]** Frequent `getChatMember` calls could hit Telegram rate limits (30/s). **Mitigation**: 5-minute cache TTL, fallback to cached result on 429.
- **[Bot Not Admin]** If the bot is removed from a required channel, `getChatMember` throws 400 error. **Mitigation**: On fetch error (not 429), treat as "channel unavailable" and block access with a message to contact admin.
- **[Churn Detection]** Users who join then leave will only be caught on their next interaction. **Trade-off**: Acceptable — leaving mid-session is rare and polling would be wasteful.
- **[Private Channels]** Invite links for private channels must be kept current. **Mitigation**: Admin provides invite link when adding the channel; bot stores it.
