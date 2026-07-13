## ADDED Requirements

### Requirement: Per-chat Spotify account linking via PKCE
The system SHALL let each allowed chat authorize its own Spotify account through a PKCE OAuth flow with a server-hosted redirect URI, and SHALL store the resulting tokens keyed by chat ID, independent of every other chat's tokens.

#### Scenario: Chat links their Spotify account
- **WHEN** an allowed chat starts the Spotify link flow and completes consent in their browser
- **THEN** the system exchanges the authorization code for tokens and stores them associated with that chat ID only

#### Scenario: State parameter prevents cross-chat mixups
- **WHEN** the OAuth callback is invoked with a `state` value not issued for the calling chat, or expired
- **THEN** the system rejects the callback and stores no tokens

#### Scenario: Chat generates a playlist without linking Spotify first
- **WHEN** an allowed chat requests playlist generation before linking a Spotify account
- **THEN** the system prompts them to link Spotify before running the generation loop

### Requirement: Token refresh
The system SHALL transparently refresh an expired Spotify access token using the stored refresh token before making an API call on that chat's behalf, without requiring the user to re-authorize.

#### Scenario: Access token expired
- **WHEN** a chat's stored Spotify access token is expired at the time of an API call
- **THEN** the system refreshes it using the stored refresh token and proceeds with the call

#### Scenario: Refresh token itself is invalid or revoked
- **WHEN** a token refresh attempt fails because the refresh token is invalid or revoked
- **THEN** the system clears the chat's stored tokens and prompts them to re-link Spotify

### Requirement: Spotify Connect playback control
The system SHALL let a linked chat control playback (play/pause/skip/volume) on their own active Spotify Connect device through the bot/Mini App, scoped strictly to that chat's own linked account.

#### Scenario: Chat plays a resolved track
- **WHEN** a linked chat selects a track from a generated playlist to play
- **THEN** the system issues a Spotify Connect playback command against that chat's linked account and active device

#### Scenario: No active Spotify Connect device
- **WHEN** a linked chat issues a playback command and no Spotify Connect device is active on their account
- **THEN** the system reports that no active device was found instead of silently failing
