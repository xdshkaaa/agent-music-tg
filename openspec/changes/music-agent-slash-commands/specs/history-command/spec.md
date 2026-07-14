## ADDED Requirements

### Requirement: Generation history via /history

The bot SHALL record each successful generation in a `generations` table with the user's chat ID, prompt text, playlist name, track count, and timestamp.

The bot SHALL respond to `/history` with the last 10 generations for the user, showing playlist name, prompt snippet, and date.

#### Scenario: /history with past generations

- **WHEN** user sends `/history`
- **WHEN** the user has past generations recorded
- **THEN** the bot responds with a list of the last 10 generations

#### Scenario: /history with no generations

- **WHEN** user sends `/history`
- **WHEN** the user has no past generations
- **THEN** the bot responds with a message that no history exists yet

#### Scenario: Generation is recorded on success

- **WHEN** a generation completes successfully (status: "ok")
- **THEN** the generation is inserted into the `generations` table
- **THEN** the record includes chat_id, prompt, playlist name, and track count
