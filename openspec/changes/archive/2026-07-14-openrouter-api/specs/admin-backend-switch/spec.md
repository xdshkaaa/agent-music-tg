## ADDED Requirements

### Requirement: Admin can view active backend in Telegram menu
The system SHALL show the currently active music backend name in the admin backend-selection screen.

#### Scenario: Admin opens backend selection
- **WHEN** admin taps "Источник" button in the admin menu
- **THEN** system shows a message with the text "Активный источник: <name>" and an inline keyboard with available backends

### Requirement: Admin can switch backend from inline keyboard
The system SHALL let admin tap any backend button in the selection keyboard to set it as active. The setting SHALL be persisted in SQLite via `setActiveBackendId()`.

#### Scenario: Admin taps a backend option
- **WHEN** admin taps a backend button (e.g., "soundcloud")
- **THEN** system calls `setActiveBackendId(db, "soundcloud")`, re-renders the selection keyboard with the new backend highlighted, and shows an answer callback query confirmation

### Requirement: Backend selection shows available options
The system SHALL list all available backends from `AVAILABLE_BACKENDS` constant, with the active one visually distinguished.

#### Scenario: Backend list renders with current selection
- **WHEN** backend selection screen is shown
- **THEN** the message SHALL include buttons for each available backend
- **THEN** the currently active backend button SHALL use success style (green) with a checkmark indicator
- **THEN** inactive backends SHALL use default style

### Requirement: Backend screen has back navigation
The backend selection screen SHALL include a "Назад" button that returns to the main admin menu.

#### Scenario: Admin taps back from backend selection
- **WHEN** admin taps "Назад" button
- **THEN** system re-sends the main admin menu message with all top-level buttons
