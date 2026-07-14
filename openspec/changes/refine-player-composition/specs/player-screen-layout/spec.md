## ADDED Requirements

### Requirement: Progress bar with time labels
The player screen progress bar SHALL display current playback time and total duration on either side of the progress bar.

Time SHALL be formatted as `mm:ss` (e.g. `1:23` / `3:45`). If duration is unknown (loading), labels SHALL be hidden.

Current time SHALL update on every `timeupdate` event of the underlying Audio element.

The component SHALL read `currentTime` and `duration` from the player context (PlayerState).

#### Scenario: Time labels shown
- **WHEN** track is playing with `currentTime=83` and `duration=225`
- **THEN** left label shows `1:23` and right label shows `3:45`

#### Scenario: Time labels hidden during loading
- **WHEN** track is loading and `duration` is 0
- **THEN** time labels are hidden

#### Scenario: Progress seek with time feedback
- **WHEN** user seeks to a new position
- **THEN** current time label updates to reflect the new position on next timeupdate

### Requirement: Grouped controls panel
The play/pause button and volume control SHALL be grouped in a visually distinct container (`.player-screen-controls`).

This container SHALL be positioned below the progress bar with a gap of 16px from the progress wrap.

Inside the container, the play button SHALL be centered. The volume control SHALL be below or inline with the play button.

#### Scenario: Controls render in container
- **WHEN** PlayerScreen renders with an active track
- **THEN** play button and VolumeControl are inside `.player-screen-controls`

#### Scenario: Play button toggles playback
- **WHEN** user clicks play button in controls panel
- **THEN** `player.toggle(track)` is called

### Requirement: Play button size
The play/pause button in PlayerScreen SHALL be 56×56px (down from current 72×72px).

#### Scenario: Button is 56px
- **WHEN** PlayerScreen renders
- **THEN** `.player-screen-play-btn` width and height are 56px

### Requirement: Adjusted vertical spacing
The PlayerScreen SHALL use the following gaps between sections:
- Header → Artwork: 8px
- Artwork → Info: 12px
- Info → Progress wrap: 8px
- Progress wrap → Controls: 16px
- Controls → bottom: 16px

#### Scenario: Correct gaps applied
- **WHEN** PlayerScreen renders
- **THEN** vertical gaps match the specified spacing
