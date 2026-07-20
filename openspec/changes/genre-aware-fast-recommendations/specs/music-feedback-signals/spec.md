## ADDED Requirements

### Requirement: Authenticated music feedback ingestion
The system SHALL accept authenticated, validated feedback for `play_started`, `play_completed`, and `skipped` events tied to a concrete music-backend track URI.

#### Scenario: Valid feedback event
- **WHEN** an authenticated Mini App user submits an allowed event with a valid track URI, title, and artist
- **THEN** the system stores or aggregates the signal for that user and returns success

#### Scenario: Invalid feedback event
- **WHEN** an event type or track URI is invalid or required metadata is missing
- **THEN** the endpoint rejects the request without writing feedback

#### Scenario: Feedback is repeated
- **WHEN** the same coarse track event is sent repeatedly in a session
- **THEN** storage remains bounded through aggregation rather than unbounded duplicate rows

### Requirement: Feedback does not block user actions
Feedback submission SHALL be best-effort and SHALL NOT block playback, seeking, navigation, or playlist generation.

#### Scenario: Feedback request fails
- **WHEN** the network or server rejects a feedback event
- **THEN** playback and the visible player state continue without an error interruption

### Requirement: Feedback retention is minimal
The system SHALL store only the authenticated chat id, track identity and metadata, aggregate event counters, and timestamps needed for recommendation ranking.

#### Scenario: Feedback is stored
- **WHEN** a valid event is recorded
- **THEN** no audio bytes, voice recordings, prompt transcript, or Telegram init payload are persisted with it
