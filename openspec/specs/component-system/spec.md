# component-system Specification

## Purpose
TBD - created by archiving change minimalist-ui-refactor. Update Purpose after archive.
## Requirements
### Requirement: Flat card panel
The `.glass-panel` class SHALL render a flat card with `background: var(--card)`, `border: 1px solid var(--hairline)`, `border-radius: 12px`, `padding: 24px`. No `box-shadow`, no `backdrop-filter`, no `::before` highlight. The `GlassPanel` React component SHALL remain but use updated styles.

#### Scenario: GlassPanel renders a flat card
- **WHEN** rendering `<GlassPanel>content</GlassPanel>`
- **THEN** the DOM node SHALL have `background: var(--card)`, `border: 1px solid var(--hairline)`, `border-radius: 12px`

#### Scenario: GlassPanel has no glass effects
- **WHEN** inspecting the computed style of a `.glass-panel`
- **THEN** `backdrop-filter` SHALL be `none` and `box-shadow` SHALL be `none`

### Requirement: Flat primary button
The `.glass-button.primary` class SHALL render with `background: #111111`, `color: #FFFFFF`, `border: none`, `border-radius: 6px`, `padding: 14px 20px`, `font-weight: 600`. No `box-shadow`. Hover: `background: #333333`. Active: `transform: scale(0.98)`. Disabled: `opacity: 0.5`, `cursor: not-allowed`.

Default `.glass-button` (non-primary) SHALL have `background: transparent`, `border: 1px solid var(--hairline)`, `color: var(--text-primary)`, `border-radius: 6px`.

#### Scenario: Primary button is flat dark
- **WHEN** rendering `.glass-button.primary`
- **THEN** background SHALL be `#111111`, box-shadow SHALL be `none`

#### Scenario: Default button is bordered
- **WHEN** rendering `.glass-button` without `.primary`
- **THEN** it SHALL have `border: 1px solid var(--hairline)` and transparent background

#### Scenario: Button active state scales down
- **WHEN** button is pressed
- **THEN** `transform: scale(0.98)` SHALL apply

### Requirement: Flat text input
The `.glass-input` class SHALL render with `background: var(--canvas)`, `border: 1px solid var(--hairline)`, `border-radius: 6px`, `padding: 14px 16px`, `color: var(--text-primary)`. No `backdrop-filter`, no `box-shadow`. Focus: `border-color` SHALL change to an accent color.

#### Scenario: Input is flat with border
- **WHEN** rendering `.glass-input`
- **THEN** `backdrop-filter` SHALL be `none`, `box-shadow` SHALL be `none`, `border-radius` SHALL be `6px`

### Requirement: Dock navigation is flat
The `.dock` class SHALL render with `background: var(--card)`, `border: 1px solid var(--hairline)`, `border-radius: 12px` (not `999px`), `padding: 4px`. No `box-shadow`. `.dock-tab` active state SHALL use a flat accent background (pastel), not purple.

#### Scenario: Dock is not a pill
- **WHEN** inspecting `.dock`
- **THEN** `border-radius` SHALL be `12px` or `16px`, not `999px`

#### Scenario: Dock tab active uses muted pastel
- **WHEN** `.dock-tab.active`
- **THEN** `background` SHALL be one of the pale pastels (`#E1F3FE`, `#EDF3EC`, etc.), not `rgba(168, 85, 247, 0.16)`

### Requirement: Segmented control is flat
The `.segmented` class SHALL render with `background: var(--canvas)`, `border: 1px solid var(--hairline)`, `border-radius: 8px`. No `backdrop-filter`. The sliding indicator SHALL use `background: var(--card)` with flat border. The `.segmented-option` SHALL use `border-radius: 6px`.

#### Scenario: Segmented control has no glass effects
- **WHEN** inspecting `.segmented`
- **THEN** `backdrop-filter` SHALL be `none`

### Requirement: Track row has flat hover
The `.track-row` SHALL use `border-bottom: 1px solid var(--hairline)`, `border-radius: 8px`. Hover: `background: rgba(0,0,0,0.03)`. The `.track-artwork` SHALL use `border-radius: 6px`.

#### Scenario: Track row has subtle hover
- **WHEN** hovering a `.track-row`
- **THEN** `background` SHALL shift to `rgba(0,0,0,0.03)` (light) or equivalent in dark

### Requirement: Wallet pill is flat chip
The `.wallet-pill` SHALL use `border-radius: 6px` (not `999px`), `background: var(--card)`, `border: 1px solid var(--hairline)`. No shadow.

#### Scenario: Wallet pill radius is subtle
- **WHEN** inspecting `.wallet-pill`
- **THEN** `border-radius` SHALL be `6px`

