# player-screen (delta)

## MODIFIED Requirements

### Requirement: PlayerScreen shows track info
The PlayerScreen SHALL display the currently playing track's title and artist name, and a large artwork placeholder. The artist name SHALL be a tappable control that opens the artist's page.

#### Scenario: Track info is displayed
- **WHEN** PlayerScreen is open and a track is loaded
- **THEN** the track title and artist name are displayed prominently

#### Scenario: Artwork placeholder is shown
- **WHEN** PlayerScreen is open
- **THEN** a large gradient placeholder is shown in the upper portion of the screen

#### Scenario: Artist name opens artist page
- **WHEN** user taps the artist name in the PlayerScreen
- **THEN** the artist page for that artist opens

### Requirement: PlayerScreen has playback controls
The PlayerScreen SHALL provide play/pause toggle, a seekable progress bar, a volume slider, and a mute toggle. The progress bar SHALL support smooth pointer dragging with an enlarged interaction area, matching the volume slider's pointer behavior: the thumb follows the pointer during drag, the seek commits on release, and the displayed time previews the drag position.

#### Scenario: Play/pause toggles playback
- **WHEN** user taps play/pause button on PlayerScreen
- **THEN** playback toggles between playing and paused

#### Scenario: Seek via progress bar drag
- **WHEN** user presses anywhere in the progress bar's enlarged hit area and drags
- **THEN** the fill and thumb follow the pointer continuously, the current-time label previews the position, and playback seeks there on release

#### Scenario: Seek via tap
- **WHEN** user taps the progress bar without dragging
- **THEN** playback seeks to the tapped position

#### Scenario: Volume slider adjusts volume
- **WHEN** user drags the volume slider on PlayerScreen
- **THEN** playback volume changes accordingly

#### Scenario: Mute toggle mutes and unmutes
- **WHEN** user taps the mute button on PlayerScreen
- **THEN** audio mutes; tapping again unmutes
