## ADDED Requirements

### Requirement: Player emits non-blocking recommendation feedback
The player SHALL emit best-effort playback feedback with per-track deduplication and SHALL NOT wait for feedback delivery before updating controls or navigation.

#### Scenario: Track starts playing
- **WHEN** a new track successfully begins playback
- **THEN** the player emits at most one `play_started` event for that track in the current playback session

#### Scenario: Track meaningfully completes
- **WHEN** playback reaches the configured completion threshold
- **THEN** the player emits at most one `play_completed` event for that track in the current playback session

#### Scenario: User skips early
- **WHEN** the user changes away from a started track before the completion threshold
- **THEN** the player emits at most one `skipped` event for that track in the current playback session

#### Scenario: Feedback transport is unavailable
- **WHEN** feedback delivery fails
- **THEN** play, pause, seek, next, previous, and screen navigation behavior remain unchanged
