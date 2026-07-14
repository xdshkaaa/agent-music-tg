## ADDED Requirements

### Requirement: Admin can view active provider in Telegram menu
The system SHALL show the currently active AI provider name in the admin provider-selection screen.

#### Scenario: Admin opens provider selection
- **WHEN** admin taps "Провайдер" button in the admin menu
- **THEN** system shows a message with the text "Активный провайдер: <name>" and an inline keyboard with available providers

### Requirement: Admin can switch provider from inline keyboard
The system SHALL let admin tap any provider button in the selection keyboard to set it as active. The setting SHALL be persisted in SQLite via `setActiveProviderId()`.

#### Scenario: Admin taps a provider option
- **WHEN** admin taps a provider button (e.g., "openrouter")
- **THEN** system calls `setActiveProviderId(db, "openrouter")`, re-renders the selection keyboard with the new provider highlighted, and shows an answer callback query confirmation

#### Scenario: Admin switches to unconfigured provider
- **WHEN** admin taps a provider whose API key is not set in env
- **THEN** system still switches the active provider (credential validation happens at generation time)

### Requirement: Provider selection shows available options
The system SHALL list all available providers from `AVAILABLE_PROVIDERS` constant, with the active one visually distinguished.

#### Scenario: Provider list renders with current selection
- **WHEN** provider selection screen is shown
- **THEN** the message SHALL include buttons for each of: anthropic, openai, openrouter, opencode, ollama
- **THEN** the currently active provider button SHALL use success style (green) with a checkmark indicator
- **THEN** inactive providers SHALL use default style

### Requirement: Provider screen has back navigation
The provider selection screen SHALL include a "Назад" button that returns to the main admin menu.

#### Scenario: Admin taps back from provider selection
- **WHEN** admin taps "Назад" button
- **THEN** system re-sends the main admin menu message with all top-level buttons
