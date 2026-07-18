# player-lyrics

## ADDED Requirements

### Requirement: Lyrics button opens a lyrics view
The fullscreen player SHALL provide a dedicated Lyrics button. Tapping it SHALL open a lyrics view (screen or sheet layered over the player) without interrupting playback.

#### Scenario: Open lyrics
- **WHEN** user taps the Lyrics button
- **THEN** the lyrics view opens over the player and playback continues

#### Scenario: Close lyrics
- **WHEN** user dismisses the lyrics view
- **THEN** the player is visible again in its prior state

### Requirement: Lyrics are fetched server-side
The server SHALL expose an initData-authenticated endpoint that resolves lyrics for a track (artist + title + duration) via LRCLIB, returning synced lines (timestamped) when available, plain text otherwise, and a distinct "not found" result. Responses SHALL be cached server-side.

#### Scenario: Synced lyrics found
- **WHEN** LRCLIB returns synced lyrics for the track
- **THEN** the endpoint returns timestamped lines

#### Scenario: Only plain lyrics found
- **WHEN** LRCLIB has only unsynced lyrics
- **THEN** the endpoint returns plain text marked as unsynced

#### Scenario: No lyrics
- **WHEN** LRCLIB has no match
- **THEN** the endpoint returns a not-found result and the client shows a friendly Russian empty state (no error banner)

### Requirement: Synced lyrics follow playback
When synced lyrics are available, the lyrics view SHALL highlight the current line based on playback position and keep it scrolled into view. Tapping a line SHALL seek playback to that line's timestamp.

#### Scenario: Active line highlight
- **WHEN** playback crosses a line's timestamp
- **THEN** that line becomes highlighted and auto-scrolls into view

#### Scenario: Tap-to-seek
- **WHEN** user taps a lyric line
- **THEN** playback seeks to that line's timestamp

#### Scenario: Unsynced fallback
- **WHEN** only plain lyrics exist
- **THEN** the full text is shown scrollable with no active-line tracking
