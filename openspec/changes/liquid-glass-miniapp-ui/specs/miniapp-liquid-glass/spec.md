## ADDED Requirements

### Requirement: Layered liquid-glass depth tokens

The Mini App SHALL define three reusable CSS custom properties as the shared glass depth language, and expose them through utility classes so any surface can adopt the effect without duplicating shadow stacks:

- `--glass-shadow` applied via `.glass` — the resting surface (multi-layer inset highlights + inset dark occlusion + outer drop shadow).
- `--glass-shadow-active` applied via `.glass-active` — the pressed/selected surface.
- `--glass-shadow-indicator` applied via `.glass-indicator` — the sliding marker of a segmented control.

#### Scenario: Resting surface uses layered shadow

- **WHEN** a panel or button is rendered in its default state
- **THEN** its depth is produced by the `--glass-shadow` token (a lit top edge and grounded drop shadow), not a single flat `box-shadow`

#### Scenario: Pressed feedback

- **WHEN** the user presses a glass button or tab
- **THEN** the element renders the `--glass-shadow-active` treatment, reading as recessed/selected rather than only scaling

### Requirement: Glass surfaces remain theme-aware

The liquid-glass effect SHALL render correctly in both Telegram light and dark schemes. Because the base tokens are tuned for a dark background, the system SHALL provide a light-scheme variant so highlights and occlusion stay legible and the surface never washes out or turns muddy.

#### Scenario: Dark scheme

- **WHEN** the Mini App renders under `data-scheme="dark"`
- **THEN** glass surfaces show bright inset top highlights against the dark gradient with visible depth

#### Scenario: Light scheme

- **WHEN** the Mini App renders under `data-scheme="light"`
- **THEN** glass surfaces retain readable edges and depth without appearing as flat or invisible panels

### Requirement: Settings uses a segmented control with sliding indicator

The admin SettingsScreen provider and backend pickers SHALL be presented as segmented controls. Each control SHALL show all options in a single glass track with one `.glass-indicator` marking the active option. Selecting an option SHALL move the indicator to that option and persist the choice through the existing settings API.

#### Scenario: Active option marked by indicator

- **WHEN** the SettingsScreen loads with an active provider/backend
- **THEN** the indicator sits under the active option and the other options read as unselected

#### Scenario: Switching option

- **WHEN** the admin taps a non-active option
- **THEN** the indicator moves to that option AND the corresponding `setActiveProvider`/`setActiveBackend` API call persists the selection

### Requirement: Motion respects reduced-motion preference

Any transition introduced by the glass system — notably the segmented indicator slide — SHALL be suppressed when the user requests reduced motion.

#### Scenario: Reduced motion

- **WHEN** the user has `prefers-reduced-motion: reduce`
- **THEN** the indicator changes position without an animated slide and no glass transition animates
