## ADDED Requirements

### Requirement: Probe track availability without full download

The system SHALL provide a lightweight probe method that checks whether a track is playable without downloading the full audio file.

#### Scenario: Probe succeeds for available track

- **WHEN** `probe(ytm:validVideoId)` is called
- **THEN** the probe returns `{ available: true }` within 5 seconds

#### Scenario: Probe fails for unavailable track

- **WHEN** `probe(ytm:deletedVideoId)` is called
- **THEN** the probe returns `{ available: false, reason: string }`

#### Scenario: Probe with retry on transient failure

- **WHEN** probe fails with non-fatal error (rate limit, timeout)
- **THEN** the system retries up to 2 times with 1-second delay

### Requirement: Background track verification after playlist generation

The system SHALL start background verification of all tracks immediately after a playlist is finalized. Verification runs asynchronously without blocking the response to the user.

#### Scenario: Verification starts after generation

- **WHEN** playlist generation completes with status `ok`
- **THEN** all tracks in the playlist SHALL be queued for verification

#### Scenario: Verification is concurrent

- **WHEN** verifying tracks
- **THEN** up to 3 tracks SHALL be probed simultaneously

### Requirement: Track verification status API

The system SHALL expose track verification status via an API endpoint for polling by the Mini App.

#### Scenario: Poll verification status

- **WHEN** client calls `GET /api/tracks/verify?uris=ytm:id1,ytm:id2`
- **THEN** the response SHALL contain `Record<uri, TrackVerificationStatus>`

#### Scenario: All tracks checked

- **WHEN** all tracks for a playlist have been probed
- **THEN** each track SHALL have status `verified` or `unavailable`

### Requirement: Display verification status in Mini App

The Mini App SHALL display verification status for each track in the playlist list before the user presses play.

#### Scenario: Show verification status icon

- **WHEN** ResultsScreen renders a track
- **THEN** it SHALL display an icon indicating the track's verification status

#### Scenario: Block play on unavailable track

- **WHEN** user clicks a track with status `unavailable`
- **THEN** the system SHALL NOT attempt playback and SHALL notify the user

#### Scenario: Dynamic status update

- **WHEN** verification status changes from `checking` to `verified` or `unavailable`
- **THEN** the UI SHALL update the icon without page reload

### Requirement: Skip broken tracks in Telegram auto-delivery

The system SHALL skip tracks marked as `unavailable` during automatic audio delivery to Telegram chat.

#### Scenario: Skip unavailable track during delivery

- **WHEN** `deliverAutoAudio` encounters a track with status `unavailable`
- **THEN** the track SHALL be skipped and the delivery summary SHALL include it in failure count

#### Scenario: Wait for pending verification during delivery

- **WHEN** `deliverAutoAudio` encounters a track with status `pending` or `checking`
- **THEN** the system SHALL wait up to 30 seconds for verification to complete before deciding to skip or deliver
