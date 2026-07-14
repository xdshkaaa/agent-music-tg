## ADDED Requirements

### Requirement: View and switch AI model via /model

The bot SHALL accept `/model` to show the currently active AI model for the user.

The bot SHALL accept `/model <name>` to set the user's preferred model, validated against available models.

The user's model preference SHALL be stored per-user and persist across sessions.

The bot SHALL fall back to the server's default model if no user preference is set.

#### Scenario: /model shows current model

- **WHEN** user sends `/model` without arguments
- **THEN** the bot responds with the currently active model name

#### Scenario: /model sets a valid model

- **WHEN** user sends `/model claude-3`
- **THEN** the bot stores the user's preference and confirms the active model

#### Scenario: /model with invalid model name

- **WHEN** user sends `/model nonexistent-model`
- **THEN** the bot responds with available model names
