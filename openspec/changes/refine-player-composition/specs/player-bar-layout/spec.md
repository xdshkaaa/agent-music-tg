## ADDED Requirements

### Requirement: Two-row layout
The PlayerBar SHALL render in two vertical rows: the first row with play button and track info, the second row with progress slider and volume control.

The first row SHALL contain `TrackPlayButton` on the left and `.player-info` (title + artist) filling remaining space.

The second row SHALL contain `.player-progress` (flex-grow) on the left and `VolumeControl` on the right.

The bar SHALL use `flex-direction: column` with no gap between rows. An optional hairline divider MAY separate the rows.

#### Scenario: Layout renders two rows
- **WHEN** PlayerBar mounts with an active track
- **THEN** the container has two child rows
- **THEN** the first row contains play button and track info
- **THEN** the second row contains progress and volume

#### Scenario: Clicking progress seeks
- **WHEN** user clicks on the `.player-progress` bar in the second row
- **THEN** `player.seek()` is called with the clicked fraction

#### Scenario: Changing volume works
- **WHEN** user adjusts the volume slider in the second row
- **THEN** `player.setVolume()` is called with the new value

### Requirement: Progress bar fills remaining width
The progress bar in the second row SHALL use `flex: 1` to fill available width before the volume control.

#### Scenario: Progress bar expands
- **WHEN** PlayerBar renders with width 400px
- **THEN** `.player-progress` width is 400px minus volume control width and gaps

### Requirement: Volume hidden on narrow screens
On viewports narrower than 360px, the volume slider SHALL be hidden and only the mute-toggle icon SHALL remain visible.

#### Scenario: Volume slider hidden
- **WHEN** viewport width is 320px
- **THEN** `.volume-slider` is `display: none`
- **THEN** `.volume-icon` remains visible

### Requirement: Bar adapts to track info length
Long track titles and artist names SHALL be truncated with ellipsis in both rows.

#### Scenario: Long title truncated
- **WHEN** track title exceeds available width
- **THEN** title text is truncated with `text-overflow: ellipsis`
