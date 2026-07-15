## ADDED Requirements

### Requirement: Generation rows carry a saved flag independent of access accounting
Each generation row SHALL carry a `saved` flag defaulting to false. Toggling this flag SHALL be independent of credit/subscription consumption and SHALL NOT affect trial, credit, or subscription balances.

#### Scenario: New generation defaults to unsaved
- **WHEN** a generation is created (paid or via trial)
- **THEN** its `saved` flag is false until the user explicitly saves it
