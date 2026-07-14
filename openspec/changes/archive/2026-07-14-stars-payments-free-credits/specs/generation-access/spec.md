# generation-access — delta

## ADDED Requirements

### Requirement: Signup bonus of 10 free generations
The system SHALL grant 10 generation credits exactly once per Telegram account, at the moment the user's row is first created (first bot contact or first Mini App authentication). Existing users SHALL NOT receive a retroactive grant. Repeated contact MUST NOT grant again.

#### Scenario: New user first /start
- **WHEN** a chat id unknown to the system sends /start
- **THEN** the created user has 10 credits

#### Scenario: New user arrives via Mini App first
- **WHEN** a chat id unknown to the system authenticates in the Mini App
- **THEN** the created user has 10 credits

#### Scenario: Returning user gets nothing extra
- **WHEN** an existing user (any credit balance, including 0) contacts the bot again
- **THEN** their credit balance is unchanged by the contact

#### Scenario: First contact via purchase path
- **WHEN** a grant is applied for a chat id with no user row yet
- **THEN** the row is created with the signup bonus plus the purchased grant
