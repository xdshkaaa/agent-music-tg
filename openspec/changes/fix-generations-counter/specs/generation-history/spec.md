## ADDED Requirements

### Requirement: Every completed generation is recorded in the generations log
The system SHALL record a row in the `generations` table for every successful generation,
regardless of whether it completed on the first attempt or through the agent's
clarification/resume flow. A generation record MUST include the chat id, the original
prompt, the resulting playlist name, and the track count. A generation that is abandoned,
clarified-but-not-yet-finished, or failed MUST NOT be recorded.

#### Scenario: First-attempt generation is recorded
- **WHEN** a user's generation completes successfully without clarification
- **THEN** a row is inserted into the `generations` table for that chat with the prompt, playlist name, and track count

#### Scenario: Clarification/resume generation is recorded
- **WHEN** a user answers a clarifying question and the resumed generation completes successfully
- **THEN** a row is inserted into the `generations` table for that chat (closing the long-standing gap where resumed generations were never logged)

#### Scenario: Abandoned clarification is not recorded
- **WHEN** a generation enters the clarify state but is never resumed to completion
- **THEN** no row is inserted into the `generations` table

### Requirement: Total generations used is queryable and shown to the user
The system SHALL expose the total number of generations a user has completed (count of
their `generations` rows) via the authenticated `/me` endpoint as an additive `generationsUsed`
field, and SHALL display that number to the user in the Mini App Profile account block
and in the `/credits` bot command. The count MUST reflect all completed generations
including those finished via clarification.

#### Scenario: /me reports generations used
- **WHEN** an authenticated user with 3 completed generations (including at least one via clarification) fetches `/me`
- **THEN** the response includes `generationsUsed: 3`

#### Scenario: Profile shows spent generations
- **WHEN** a user opens the Mini App Profile screen
- **THEN** the account block shows «Потрачено: N ген» using the generations-used count

#### Scenario: /credits shows spent generations
- **WHEN** a user with access runs the `/credits` command
- **THEN** the reply includes the spent generations total alongside the remaining balance
