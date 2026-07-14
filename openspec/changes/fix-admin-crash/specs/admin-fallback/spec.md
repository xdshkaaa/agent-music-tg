## ADDED Requirements

### Requirement: AdminScreen error does not break main navigation

An error in AdminScreen SHALL NOT prevent the user from navigating to other tabs or screens.

#### Scenario: AdminScreen error, user switches tab
- **WHEN** AdminScreen shows an error state (after failed load or render)
- **THEN** the BottomNav SHALL remain interactive
- **AND** the user can navigate to other tabs (Создать, Магазин, Профиль)
- **AND** those screens render normally

#### Scenario: Error in one AdminScreen panel does not break other panels
- **WHEN** one sub-panel of AdminScreen (e.g., StatsPanel) throws during render
- **THEN** the error is caught by the global ErrorBoundary
- **AND** the fallback UI is shown
- **AND** navigating back to AdminScreen on a different tab works

### Requirement: Clear error messaging

The ErrorBoundary fallback SHALL display a user-facing error message in Russian.

#### Scenario: Error message display
- **WHEN** an error is caught by the ErrorBoundary
- **THEN** the fallback displays "Что-то пошло не так" as the message
- **AND** for AdminScreen-specific errors, displays "Ошибка загрузки админки"
