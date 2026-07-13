## ADDED Requirements

### Requirement: Mini App launch from the bot
The system SHALL provide a `web_app` button from the bot that opens the Mini App at `miniapp.xdshka.party`, reachable only after the chat has passed the allowlist check.

#### Scenario: Allowed chat opens the Mini App
- **WHEN** an allowed chat taps the bot's Mini App button
- **THEN** Telegram opens the Mini App web view pointed at `miniapp.xdshka.party`

### Requirement: Mini App requests are authenticated via Telegram initData
The system SHALL verify the HMAC signature of the Telegram `initData` payload accompanying every Mini App API request against the bot token, and SHALL derive the calling chat/user identity from it rather than trusting any client-supplied identifier.

#### Scenario: Valid initData
- **WHEN** a Mini App API request carries `initData` whose HMAC signature validates against the bot token
- **THEN** the system trusts the derived chat/user ID for allowlist/admin checks

#### Scenario: Tampered or missing initData
- **WHEN** a Mini App API request carries `initData` that fails HMAC validation, or omits it
- **THEN** the system rejects the request with an authorization error

### Requirement: Liquid Glass visual style
The Mini App SHALL render its primary surfaces (prompt entry, results/playlist view, playback controls) using a Liquid Glass visual treatment — translucent, blurred, layered panels — consistent across light and dark Telegram themes.

#### Scenario: Mini App renders in Telegram's dark theme
- **WHEN** the Mini App loads inside a Telegram client set to dark theme
- **THEN** the glass panels render with appropriate contrast and legibility against the dark background

#### Scenario: Mini App renders in Telegram's light theme
- **WHEN** the Mini App loads inside a Telegram client set to light theme
- **THEN** the glass panels render with appropriate contrast and legibility against the light background

### Requirement: Core Mini App screens
The Mini App SHALL provide a prompt-entry screen, a results/playlist screen showing the generated tracks with playback controls, and — for admin chats only — a settings screen for the active AI provider and music backend.

#### Scenario: Regular user's screen set
- **WHEN** a non-admin allowed chat navigates the Mini App
- **THEN** they can reach the prompt-entry and results/playback screens but no settings screen exists in their navigation

#### Scenario: Admin's screen set
- **WHEN** an admin chat navigates the Mini App
- **THEN** they can reach the prompt-entry, results/playback, and settings screens
