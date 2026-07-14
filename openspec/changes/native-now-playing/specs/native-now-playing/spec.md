## ADDED Requirements

### Requirement: Lock screen metadata display
The system SHALL expose currently playing track metadata (title, artist) via the Media Session API so the OS lock screen and Control Center show track information.

#### Scenario: Track starts playing
- **WHEN** a track starts playing in the Mini App player
- **THEN** `navigator.mediaSession.metadata` SHALL be set with the track's title and artist
- **THEN** the album field SHALL display "Плейлист Агент"
- **THEN** the artwork SHALL be a branded fallback image if no cover art is available

#### Scenario: Track pauses
- **WHEN** playback is paused
- **THEN** `navigator.mediaSession.metadata` SHALL retain the current track info
- **THEN** `navigator.mediaSession.playbackState` SHALL be set to `"paused"`

#### Scenario: Player is idle
- **WHEN** no track is loaded (idle state)
- **THEN** `navigator.mediaSession.playbackState` SHALL be set to `"none"`
- **THEN** the metadata MAY be cleared or set to a branded placeholder

### Requirement: Playback state sync
The system SHALL synchronize the player's playback status to the OS via the Media Session API.

#### Scenario: Playback starts
- **WHEN** the audio element transitions from paused/loading to playing
- **THEN** `navigator.mediaSession.playbackState` SHALL be set to `"playing"`

#### Scenario: Playback pauses
- **WHEN** the user pauses playback via the Mini App UI
- **THEN** `navigator.mediaSession.playbackState` SHALL be set to `"paused"`

#### Scenario: Track ends
- **WHEN** the current track reaches the end
- **THEN** `navigator.mediaSession.playbackState` SHALL be set to `"paused"`

### Requirement: Lock screen play/pause control
The system SHALL respond to play/pause actions from the OS lock screen and Control Center.

#### Scenario: Pause from lock screen
- **WHEN** the user presses pause via the lock screen / Control Center
- **THEN** the audio SHALL pause
- **THEN** the player state SHALL update to `"paused"`

#### Scenario: Play from lock screen
- **WHEN** the user presses play via the lock screen / Control Center
- **THEN** the audio SHALL resume playback
- **THEN** the player state SHALL update to `"playing"`

### Requirement: Skip tracks from lock screen
The system SHALL support next/previous track actions from the OS lock screen and Control Center when a track queue is available.

#### Scenario: Next track from lock screen
- **WHEN** the user presses next track via the lock screen / Control Center
- **AND** the queue has a next track
- **THEN** the player SHALL advance to the next track and start playing

#### Scenario: Previous track from lock screen
- **WHEN** the user presses previous track via the lock screen / Control Center
- **AND** the queue has a previous track
- **THEN** the player SHALL go back to the previous track and start playing

#### Scenario: Skip when queue is single track
- **WHEN** the user presses next or previous via the lock screen / Control Center
- **AND** the queue has only one track (or is at boundary)
- **THEN** the action SHALL be a no-op (no crash, no state change)

### Requirement: Track queue management
The system SHALL support setting a track queue so that skip navigation is possible from multiple playlist views.

#### Scenario: Set queue from results screen
- **WHEN** the user taps play on a track in the ResultsScreen playlist
- **THEN** the player SHALL set the queue to all tracks in that playlist
- **THEN** the queueIndex SHALL be set to the tapped track's position

#### Scenario: Set queue from profile history
- **WHEN** the user taps play on a track in the ProfileScreen history
- **THEN** the player SHALL set the queue to all tracks in that history playlist
- **THEN** the queueIndex SHALL be set to the tapped track's position

#### Scenario: Queue cleared on navigation
- **WHEN** the user navigates away from ResultsScreen or ProfileScreen
- **THEN** the player queue MAY be cleared to prevent stale state
