## ADDED Requirements

### Requirement: Entitlement model

The system SHALL track, per user chat id, a generation credit balance (non-negative integer) and an optional subscription expiry timestamp. A user SHALL be considered to have generation access when their credit balance is greater than zero OR their subscription expiry is in the future.

#### Scenario: User with credits has access

- **WHEN** a user with a positive credit balance is checked for access
- **THEN** the system reports the user has generation access

#### Scenario: User with active subscription has access

- **WHEN** a user with a subscription expiry in the future is checked for access
- **THEN** the system reports the user has generation access regardless of credit balance

#### Scenario: User without credits or subscription has no access

- **WHEN** a user with zero credits and no future subscription expiry is checked for access
- **THEN** the system reports the user has no generation access

### Requirement: Generation gated by access

The system SHALL check generation access before starting playlist generation, from both the bot and the Mini App. When the user lacks access, the system SHALL NOT run generation and SHALL return a purchase prompt instead of a playlist.

#### Scenario: Generation blocked without access

- **WHEN** a user without generation access submits a prompt to generate a playlist
- **THEN** the system does not run generation and responds with a purchase prompt describing available offers

#### Scenario: Generation allowed with access

- **WHEN** a user with generation access submits a prompt
- **THEN** the system runs generation normally

### Requirement: Credit consumption

The system SHALL consume access on each successful generation. When the user has an active subscription, generation SHALL NOT decrement credits. When the user has no active subscription but has credits, one successful generation SHALL decrement the credit balance by one. A failed generation SHALL NOT consume credits.

#### Scenario: Credit decremented on success

- **WHEN** a user without a subscription but with credits completes a successful generation
- **THEN** the credit balance decreases by one

#### Scenario: Subscription does not consume credits

- **WHEN** a user with an active subscription completes a successful generation
- **THEN** the credit balance is unchanged

#### Scenario: Failed generation does not charge

- **WHEN** a user's generation fails with an error
- **THEN** the credit balance is unchanged

### Requirement: Profile and purchase prompt

The system SHALL let a user view their remaining credits, subscription expiry, and purchase history, and SHALL offer a way to buy access (a `/buy` command in the bot and a Mini App screen) that lists active offers.

#### Scenario: User views profile

- **WHEN** a user requests their profile
- **THEN** the system shows their remaining credits, subscription expiry (if any), and past purchases

#### Scenario: Purchase prompt lists offers

- **WHEN** a user opens the buy flow
- **THEN** the system lists active offers with title, price, and grant, each with a way to start a purchase
