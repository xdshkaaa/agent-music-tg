## MODIFIED Requirements

### Requirement: PlayerBar navigates to PlayerScreen on tap

The system SHALL navigate to the full-screen PlayerScreen when the user taps the PlayerBar, excluding interactive elements (progress bar, play/pause button). The PlayerBar SHALL be rendered as a **floating pill** (`border-radius: 999px`) with a circular, spinning artwork while playing and a conic liquid-glow ring.

#### Scenario: Tap on track title area opens player
- **WHEN** user taps the track title or artist name area of the PlayerBar
- **THEN** PlayerScreen slides up from the bottom

#### Scenario: Tap on progress bar does not open player
- **WHEN** user taps the progress bar in PlayerBar
- **THEN** seek position updates and PlayerScreen does NOT open

#### Scenario: Tap on play/pause button does not open player
- **WHEN** user taps the play/pause button in PlayerBar
- **THEN** play/pause toggles and PlayerScreen does NOT open

### Requirement: PlayerBar pill visual identity

The PlayerBar SHALL use the liquid-glass v2 pill treatment: `border-radius: 999px`, `var(--lg-v2-panel)` background, `var(--lg-v2-blur-panel)` backdrop blur, and `var(--lg-v2-shadow-md)` shadow. While playing, the artwork SHALL be circular and spin, and the capsule SHALL show the conic `--liquid-glow` ring.

#### Scenario: PlayerBar is a pill
- **WHEN** the PlayerBar is rendered
- **THEN** it has `border-radius: 999px` and the liquid-glass v2 panel appearance

#### Scenario: Artwork spins while playing
- **WHEN** a track is playing
- **THEN** the PlayerBar artwork is circular and animates a continuous spin, and the capsule shows the conic glow ring

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
- **THEN** the playback position updates accordingly
