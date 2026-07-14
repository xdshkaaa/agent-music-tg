## ADDED Requirements

### Requirement: PlayerBar navigates to PlayerScreen on tap
The system SHALL navigate to the full-screen PlayerScreen when the user taps the PlayerBar, excluding interactive elements (progress bar, play/pause button).

#### Scenario: Tap on track title area opens player
- **WHEN** user taps the track title or artist name area of the PlayerBar
- **THEN** PlayerScreen slides up from the bottom

#### Scenario: Tap on progress bar does not open player
- **WHEN** user taps the progress bar in PlayerBar
- **THEN** seek position updates and PlayerScreen does NOT open

#### Scenario: Tap on play/pause button does not open player
- **WHEN** user taps the play/pause button in PlayerBar
- **THEN** play/pause toggles and PlayerScreen does NOT open

### Requirement: PlayerScreen shows track info
The PlayerScreen SHALL display the currently playing track's title and artist name, and a large artwork placeholder.

#### Scenario: Track info is displayed
- **WHEN** PlayerScreen is open and a track is loaded
- **THEN** the track title and artist name are displayed prominently

#### Scenario: Artwork placeholder is shown
- **WHEN** PlayerScreen is open
- **THEN** a large gradient placeholder is shown in the upper portion of the screen

### Requirement: PlayerScreen has playback controls
The PlayerScreen SHALL provide play/pause toggle, a seekable progress bar, a volume slider, and a mute toggle.

#### Scenario: Play/pause toggles playback
- **WHEN** user taps play/pause button on PlayerScreen
- **THEN** playback toggles between playing and paused

#### Scenario: Seek via progress bar
- **WHEN** user drags or taps the progress bar on PlayerScreen
- **THEN** playback seeks to the corresponding position

#### Scenario: Volume slider adjusts volume
- **WHEN** user drags the volume slider on PlayerScreen
- **THEN** playback volume changes accordingly

#### Scenario: Mute toggle mutes and unmutes
- **WHEN** user taps the mute button on PlayerScreen
- **THEN** audio mutes; tapping again unmutes

### Requirement: PlayerScreen can be dismissed
The PlayerScreen SHALL provide a back button and support swipe-down gesture to dismiss.

#### Scenario: Back button dismisses player
- **WHEN** user taps the back arrow on PlayerScreen
- **THEN** PlayerScreen slides down and the underlying screen is visible

### Requirement: PlayerScreen has a slide-up/slide-down animation
The PlayerScreen SHALL animate in from the bottom and animate out to the bottom.

#### Scenario: Open animation plays
- **WHEN** PlayerScreen opens
- **THEN** it slides up from the bottom edge over ~300ms

#### Scenario: Close animation plays
- **WHEN** PlayerScreen is dismissed
- **THEN** it slides down to the bottom edge over ~250ms
