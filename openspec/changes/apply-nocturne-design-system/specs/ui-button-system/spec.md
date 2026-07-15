## ADDED Requirements

### Requirement: Buttons follow Nocturne action styling
Buttons SHALL use Nocturne `.btn` classes and variants. Primary actions SHALL be accent-outlined on transparent or dark surfaces rather than solid accent-filled. Button hover, pressed, focus-visible, disabled, block, ghost, secondary, and icon variants SHALL use Nocturne-provided styling.

#### Scenario: Primary button is outlined
- **WHEN** rendering a primary action
- **THEN** it SHALL use the Nocturne primary button treatment with an accent outline rather than a solid accent fill

#### Scenario: Button focus is themed
- **WHEN** a keyboard user focuses a button
- **THEN** the button SHALL show the Nocturne accent focus-visible ring

#### Scenario: Icon button uses Nocturne variant
- **WHEN** rendering an icon-only button
- **THEN** it SHALL use the Nocturne icon button variant and a Phosphor-compatible icon treatment
