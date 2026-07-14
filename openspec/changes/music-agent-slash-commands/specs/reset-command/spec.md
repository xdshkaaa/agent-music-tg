## ADDED Requirements

### Requirement: Session reset via /reset

The bot SHALL clear the user's current session state when `/reset` is sent, including any pending clarification flow.

The bot SHALL confirm the reset with a message to the user.

#### Scenario: /reset clears pending clarification

- **WHEN** user is awaiting clarification (pending clarify session exists)
- **WHEN** user sends `/reset`
- **THEN** the bot clears the session state
- **THEN** the bot sends a confirmation message like "Сессия сброшена"

#### Scenario: /reset with no active session

- **WHEN** user sends `/reset` and no session state exists
- **THEN** the bot responds that there is nothing to reset
