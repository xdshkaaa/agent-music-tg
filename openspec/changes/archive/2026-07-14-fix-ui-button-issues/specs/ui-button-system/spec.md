## ADDED Requirements

### Requirement: Action buttons have semantic color variants
The action button system SHALL provide three semantic variants: `default` (safe actions like retry), `destructive` (destructive actions like delete), and `neutral` (navigation like expand). All variants MUST maintain minimum 40×40px touch targets.

#### Scenario: Default button renders with neutral styling
- **WHEN** an action button has variant `default`
- **THEN** it SHALL use `var(--card)` background with `var(--hairline)` border and inherit text color

#### Scenario: Destructive button shows red on hover
- **WHEN** a destructive action button is hovered
- **THEN** its color SHALL change to red (`#ef4444`) and its background SHALL gain a red tint

#### Scenario: Neutral button is visually minimal
- **WHEN** an action button has variant `neutral`
- **THEN** it SHALL have no visible border background by default, appearing only as an icon

### Requirement: Action buttons have interaction states
Every action button MUST define styles for `hover`, `active` (pressed), `disabled`, and `focus-visible` states. Transitions SHALL use `0.18s ease` to match existing glass-button conventions.

#### Scenario: Disabled button is visually inactive
- **WHEN** an action button is `disabled`
- **THEN** it SHALL show `opacity: 0.5` and `cursor: not-allowed`, and MUST NOT respond to clicks

#### Scenario: Active button scales down
- **WHEN** an action button is pressed
- **THEN** it SHALL apply `transform: scale(0.95)` for tactile feedback

#### Scenario: Focused button shows outline
- **WHEN** an action button receives keyboard focus
- **THEN** it SHALL show a 2px `var(--accent)` outline

### Requirement: Delete action requires confirmation
The system SHALL require explicit user confirmation before deleting a download record. The confirmation dialog MUST display the playlist name.

#### Scenario: Delete shows confirmation dialog
- **WHEN** user clicks the delete button on a download entry named «My Playlist»
- **THEN** a confirmation dialog SHALL appear with text containing «My Playlist»

#### Scenario: Cancelled delete does nothing
- **WHEN** user dismisses the delete confirmation
- **THEN** the download record SHALL remain unchanged

### Requirement: Expand chevron is visually demoted
The expand/collapse control SHALL appear as a standalone chevron icon at the card's right edge, visually separated from retry and delete buttons. It MUST NOT use the same button surface as mutative actions.

#### Scenario: Chevron sits outside action group
- **WHEN** a download entry renders in collapsed state
- **THEN** the expand chevron SHALL be positioned at the card's far right edge with reduced visual weight compared to retry/delete buttons

### Requirement: Compact play button has CSS class
The compact play button (28×28px) used inside expanded track lists SHALL use a CSS class instead of inline styles. The class MUST define width, height, border radius, border, background, and hover state.

#### Scenario: Compact play button uses CSS class
- **WHEN** a track play button renders inside an expanded download entry
- **THEN** it SHALL use class `compact-play-btn` with 28×28px size and `var(--card)` background

### Requirement: Icon weights are consistent
All action button icons SHALL use `weight="regular"` from the Phosphor icons set. Compact play buttons (Play/Pause) MAY use `weight="fill"` for clarity at small sizes.

#### Scenario: Repeat and delete use regular weight
- **WHEN** the retry button renders with `ArrowsClockwise` icon
- **THEN** it SHALL use `weight="regular"`
- **WHEN** the delete button renders with `Trash` icon
- **THEN** it SHALL use `weight="regular"`

### Requirement: Warning icon has accessible label
Track warning indicators (`⚠️`) MUST have a visible tooltip or accessible label explaining the error. The native `title` attribute SHALL be populated with the track's error message.

#### Scenario: Failed track shows tooltip
- **WHEN** a track has `status === "failed"` and `error` is set
- **THEN** its warning icon SHALL have a `title` attribute containing the error message and an `aria-label` describing it
