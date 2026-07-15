## ADDED Requirements

### Requirement: Theme toggle control in the top bar

The Mini App SHALL provide a light/dark theme toggle in the top bar. Activating it SHALL flip `data-scheme` on `<html>` between `light` and `dark` and persist the user's choice (so it survives reloads).

#### Scenario: Toggle flips the scheme
- **WHEN** the user taps the theme toggle
- **THEN** `data-scheme` on `<html>` becomes the opposite of its current value and the new value is persisted

#### Scenario: Toggle reflects the target scheme
- **WHEN** the toggle button is rendered
- **THEN** it shows the icon representing the scheme it will switch to (sun icon when current scheme is dark, moon icon when current scheme is light)

#### Scenario: Manual choice overrides Telegram default
- **WHEN** the app loads and a persisted manual scheme choice exists
- **THEN** the app applies the persisted choice rather than the Telegram `colorScheme` default

### Requirement: Theme toggle is reduced-motion safe

The theme toggle SHALL NOT introduce any non-essential motion; any icon cross-fade or transition SHALL be suppressed under `prefers-reduced-motion: reduce`.

#### Scenario: Reduced motion
- **WHEN** the user prefers reduced motion
- **THEN** toggling the scheme produces no animated transition beyond the immediate theme swap
