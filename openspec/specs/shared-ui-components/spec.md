# shared-ui-components Specification

## Purpose
TBD - created by archiving change fix-ui-repetitions. Update Purpose after archive.
## Requirements
### Requirement: VolumeControl component
The system SHALL provide a reusable `VolumeControl` component used by both `PlayerBar` and `PlayerScreen`.

#### Scenario: Renders speaker icon based on volume level
- **WHEN** volume > 0.5 and not muted
- **THEN** component SHALL render `SpeakerHigh` icon

#### Scenario: Renders muted icon when muted
- **WHEN** `muted` is true
- **THEN** component SHALL render `SpeakerX` icon

#### Scenario: Slider controls volume
- **WHEN** user moves the range slider
- **THEN** component SHALL call `onSetVolume` with the new value

#### Scenario: Mute button toggles mute
- **WHEN** user clicks the mute icon button
- **THEN** component SHALL call `onToggleMute`

### Requirement: EmptyState component
The system SHALL provide a reusable `EmptyState` component for consistent empty-state display across screens.

#### Scenario: Shows icon and label
- **WHEN** component renders
- **THEN** it SHALL display the provided icon and label text

#### Scenario: Optional action button
- **WHEN** `action` prop is provided
- **THEN** component SHALL render an action button with the provided label and onClick handler

### Requirement: ErrorBanner component
The system SHALL provide a reusable `ErrorBanner` for displaying errors with dismiss and optional retry.

#### Scenario: Shows error message
- **WHEN** component renders with a message
- **THEN** it SHALL display the message with `role="alert"`

#### Scenario: Auto-dismisses after 8 seconds
- **WHEN** component mounts
- **THEN** it SHALL automatically dismiss after 8 seconds

#### Scenario: Close button
- **WHEN** user clicks close button
- **THEN** component SHALL call `onClose`

#### Scenario: Retry button
- **WHEN** `onRetry` prop is provided
- **THEN** component SHALL render a retry button

### Requirement: TrackSkeleton debounce
The system SHALL debounce the TrackSkeleton to prevent flash on fast responses.

#### Scenario: Delayed appearance
- **WHEN** `busy` becomes true
- **THEN** skeleton SHALL NOT appear for at least 200ms

#### Scenario: Minimum display duration
- **WHEN** skeleton is visible and `busy` becomes false before 400ms have elapsed
- **THEN** skeleton SHALL remain visible for at least 400ms total

