# screen-refinement (delta)

## ADDED Requirements

### Requirement: Favorites reuses the Saved Music UI
The Favorites view SHALL render with the same list UI as Saved Music (identical row layout, play behavior, and actions), not a separate bespoke layout.

#### Scenario: Favorites layout parity
- **WHEN** user opens Favorites
- **THEN** the tracks render with the same row component and actions as Saved Music

### Requirement: Merged Download and Favorite action on generation results
On generation result track rows, the separate Download and Add-to-Favorites actions SHALL be merged into a single combined action that downloads the track and adds it to Favorites.

#### Scenario: Combined action
- **WHEN** user taps the merged action on a generated track
- **THEN** the track download is queued and the track is added to Favorites in one step
