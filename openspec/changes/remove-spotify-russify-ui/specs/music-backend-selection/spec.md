## ADDED Requirements

### Requirement: Available music backends
The system SHALL offer exactly two music backends — SoundCloud and YouTube Music — and SHALL NOT reference Spotify as a selectable backend.

#### Scenario: Backend list excludes Spotify
- **WHEN** the list of available backends is read (bot `/backend` command, admin Mini App settings, or `AVAILABLE_BACKENDS`)
- **THEN** it contains `soundcloud` and `youtube-music` only
- **AND** it does not contain `spotify`

#### Scenario: Unknown backend id rejected
- **WHEN** an admin selects a backend id that is not `soundcloud` or `youtube-music`
- **THEN** the system rejects it and reports the valid options

### Requirement: No account linking required
The system SHALL generate playlists without any per-user account linking or OAuth flow.

#### Scenario: Text prompt generates without linking
- **WHEN** an allowed user sends a mood/prompt to the bot or Mini App
- **THEN** the system generates a playlist immediately
- **AND** the system never asks the user to link or authorize an external music account

#### Scenario: No link command or link endpoints
- **WHEN** a user interacts with the bot or the Mini App
- **THEN** no `/link` command, "connect account" UI, or account-status/link HTTP endpoint is offered

### Requirement: Default backend
The system SHALL use `youtube-music` as the default active backend wherever a default must be resolved.

#### Scenario: Default resolves to YouTube Music
- **WHEN** no active backend has been explicitly configured for a chat
- **THEN** the active backend resolves to `youtube-music`

### Requirement: Resolve-only playback
The system SHALL present generated tracks as open-in-app deep links and SHALL NOT expose remote playback controls (play/pause/next/previous/volume).

#### Scenario: Track opens in provider app
- **WHEN** a generated playlist is shown in the Mini App
- **THEN** each track offers an "open in app" link to the provider
- **AND** no remote transport/playback controls are shown
