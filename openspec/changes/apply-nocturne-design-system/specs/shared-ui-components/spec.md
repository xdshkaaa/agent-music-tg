## ADDED Requirements

### Requirement: Shared components align to Nocturne catalog
Shared tags, fields, cards, navigation, tables, dialogs, and image blocks SHALL align with the Nocturne component catalog and use the provided classes where applicable.

#### Scenario: Tags use Nocturne tag variants
- **WHEN** rendering labels or badges
- **THEN** they SHALL use `.tag` with the appropriate Nocturne variant

#### Scenario: Cards use Nocturne card structure
- **WHEN** rendering content cards
- **THEN** they SHALL use `.card` and related Nocturne card sub-classes where applicable

#### Scenario: Forms use Nocturne field classes
- **WHEN** rendering form controls
- **THEN** labels, inputs, radios, and segmented controls SHALL use Nocturne form classes where applicable

#### Scenario: Dialogs use Nocturne modal structure
- **WHEN** rendering a modal dialog
- **THEN** it SHALL use Nocturne dialog and backdrop classes
