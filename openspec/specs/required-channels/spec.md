# required-channels Specification

## Purpose
TBD - created by archiving change subscription-gate. Update Purpose after archive.
## Requirements
### Requirement: Store required channels in database
The system SHALL maintain a `required_channels` table with columns: `id` (INTEGER PK AUTOINCREMENT), `channel_id` (INTEGER, UNIQUE, NOT NULL — Telegram chat ID), `username` (TEXT, nullable — public @username), `invite_link` (TEXT, nullable — custom invite link), `title` (TEXT, NOT NULL), `added_by` (INTEGER — admin chat_id who added it), `created_at` (INTEGER — unix timestamp).

#### Scenario: Admin adds a required channel
- **WHEN** admin completes the "Add Channel" flow in the admin panel
- **THEN** a new row is inserted into `required_channels` with channel ID, title, invite link, and admin chat_id

#### Scenario: Channel ID is unique
- **WHEN** admin tries to add a channel that already exists in `required_channels`
- **THEN** the system rejects the duplicate and shows an error message

### Requirement: Track per-user channel membership
The system SHALL maintain a `channel_memberships` table with columns: `chat_id` (INTEGER), `channel_id` (INTEGER), `is_member` (INTEGER — 0/1), `checked_at` (INTEGER — unix timestamp of last check). PRIMARY KEY is (chat_id, channel_id).

#### Scenario: Membership is cached after first check
- **WHEN** user's membership is verified for a required channel
- **THEN** the result is stored in `channel_memberships` with the current timestamp

#### Scenario: Stale cache triggers re-check
- **WHEN** user interacts with the bot and `now - checked_at > 300` for any required channel
- **THEN** the system re-checks membership via `getChatMember` API and updates the cache

### Requirement: Gate middleware blocks unsubscribed users
The system SHALL register a `channelSubscriptionGate` middleware after `allowlistGate` that blocks all bot commands and messages for users who are not subscribed to all required channels.

#### Scenario: No required channels configured
- **WHEN** `required_channels` table is empty
- **THEN** the middleware SHALL pass through without any checks

#### Scenario: User is subscribed to all required channels
- **WHEN** user sends any message and `channel_memberships` shows `is_member = 1` for all required channels (and cache is fresh)
- **THEN** the middleware SHALL call `next()` and pass control to downstream handlers

#### Scenario: User is not subscribed to a required channel
- **WHEN** user sends any message and membership check fails for at least one required channel
- **THEN** the middleware SHALL send a gate message with channel list and invite buttons, and SHALL NOT pass to downstream handlers

#### Scenario: bot is not admin of required channel
- **WHEN** `getChatMember` throws 400 error (bot not in channel)
- **THEN** the system SHALL block access with a message to contact the admin

#### Scenario: Rate limit hit during check
- **WHEN** `getChatMember` throws 429 error
- **THEN** the system SHALL fall back to last cached membership value; if no cache exists, SHALL treat as "not subscribed"

### Requirement: Show gate message with channel list and invite buttons
The system SHALL display a message with: explanation text, an inline button per channel (opens invite link or channel), and a "✅ I joined" button that re-checks membership.

#### Scenario: First gate message is sent
- **WHEN** user is blocked by the gate for the first time
- **THEN** the system sends a new message with channel buttons and "✅ I joined" button

#### Scenario: Subsequent blocked interactions edit existing gate message
- **WHEN** user is already in gate state and tries to interact again
- **THEN** the system edits the existing gate message (does not send a new one) to avoid chat spam

### Requirement: "I joined" callback re-checks membership
The system SHALL handle a `subgate:check` callback query that immediately re-checks all required channels via `getChatMember` without cache TTL.

#### Scenario: User clicks "I joined" and now subscribed
- **WHEN** user clicks "✅ I joined" and `getChatMember` confirms membership for all channels
- **THEN** the system edits the gate message to a success message and continues normal flow on next interaction

#### Scenario: User clicks "I joined" but still not subscribed
- **WHEN** user clicks "✅ I joined" and membership is still missing for at least one channel
- **THEN** the system edits the gate message to indicate which channels still need to be joined

### Requirement: Admin panel manages required channels
The system SHALL add a "Channel Gate" section in the `/admin` panel with: list of required channels (with title, username, invite link), add new channel (FSM: prompt for invite link/username → resolve to channel ID via `getChat` → confirm → save), remove channel (confirm then delete).

#### Scenario: Admin opens Channel Gate section
- **WHEN** admin clicks "Channel Gate" in admin menu
- **THEN** the system shows a list of required channels with inline buttons: Add, and per-channel Remove

#### Scenario: Admin adds a channel by username
- **WHEN** admin provides a public channel @username via FSM
- **THEN** the system resolves it to channel ID via `getChat`, shows confirmation with channel title, and saves on confirm

#### Scenario: Admin adds a channel by invite link
- **WHEN** admin provides an invite link via FSM
- **THEN** the system resolves it to channel ID via `getChat` (bot must be in the channel), shows confirmation with channel title, and saves the invite link

#### Scenario: Admin removes a required channel
- **WHEN** admin clicks Remove on a channel and confirms
- **THEN** the system deletes the channel from `required_channels` and clears cached memberships for that channel

### Requirement: Add migration for database tables
The system SHALL auto-migrate the database on startup, creating `required_channels` and `channel_memberships` tables if they don't exist, and adding `subscription_gate_enabled` (INTEGER default 0) column to `settings`.

#### Scenario: First bot start after update
- **WHEN** the bot starts and `required_channels` table does not exist
- **THEN** the system SHALL create the table via auto-migration

### Requirement: Gate can be toggled on/off
The system SHALL support a `subscription_gate_enabled` setting (stored in `settings` table, key `subscription_gate_enabled` with value `"1"` or `"0"`). When disabled, the `channelSubscriptionGate` middleware SHALL pass through without checks.

#### Scenario: Admin toggles gate off
- **WHEN** admin toggles the gate off in the admin panel
- **THEN** the middleware stops blocking users even if required channels are configured

