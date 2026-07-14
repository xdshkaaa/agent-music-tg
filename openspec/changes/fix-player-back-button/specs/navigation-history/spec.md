## ADDED Requirements

### Requirement: Navigation history stack

The Mini App SHALL maintain a stack of Screen states to support back navigation.

#### Scenario: Navigate forward pushes to history

- **WHEN** `navigate(screen)` is called without `dir: "back"`
- **THEN** `screen` is appended to the history array

#### Scenario: Navigate back pops from history

- **WHEN** `navigate(screen, "back")` is called
- **THEN** the last entry is removed from the history array, revealing the previous screen

#### Scenario: History depth is bounded

- **WHEN** history exceeds 10 entries
- **THEN** the oldest entry is removed (except the root prompt screen)

#### Scenario: Bottom tab navigation resets history

- **WHEN** user clicks BottomNav tab that changes to a different tab
- **THEN** history is cleared to just the new root screen for that tab

### Requirement: BackButton state syncs with history

The Telegram BackButton visibility SHALL be synchronized with the navigation history state.

#### Scenario: BackButton visible when history has more than one entry

- **WHEN** `history.length > 1` AND player is closed
- **THEN** `Telegram.WebApp.BackButton.show()` is active

#### Scenario: BackButton hidden when on root screen

- **WHEN** `history.length === 1` AND player is closed
- **THEN** `Telegram.WebApp.BackButton.hide()` is active

### Requirement: ScreenTransition respects history direction

ScreenTransition animation direction SHALL be derived from the history operation.

#### Scenario: Forward navigation animates forward

- **WHEN** a new screen is pushed onto the stack
- **THEN** `transitionDir` is set to `"forward"`

#### Scenario: Back navigation animates backward

- **WHEN** history is popped (back navigation)
- **THEN** `transitionDir` is set to `"back"`
