## ADDED Requirements

### Requirement: Check access before generation
The system SHALL check if the user has access (credits > 0 or active subscription) before starting playlist generation.

#### Scenario: User has sufficient credits
- **WHEN** the user initiates generation via bot or Mini App
- **AND** the user has `credits > 0`
- **THEN** generation SHALL proceed

#### Scenario: User has active subscription
- **WHEN** the user initiates generation
- **AND** the user has `subscription_until > now`
- **THEN** generation SHALL proceed

#### Scenario: User has no access
- **WHEN** the user initiates generation
- **AND** the user has `credits <= 0 AND subscription_until <= now`
- **THEN** the system SHALL return a `needs_purchase` outcome
- **AND** the bot SHALL show a purchase prompt with active offers

#### Scenario: Payments disabled
- **WHEN** `PAYMENTS_ENABLED` is false
- **THEN** `hasAccess` SHALL return true for all users
- **AND** generation SHALL proceed without entitlement check

### Requirement: Consume access on successful generation
The system SHALL consume one credit from the user's balance only after a successful playlist generation.

#### Scenario: Successful generation consumes credit
- **WHEN** generation completes successfully
- **AND** the user does not have a subscription
- **THEN** the system SHALL decrement `credits` by 1

#### Scenario: Subscription users not charged credits
- **WHEN** generation completes successfully
- **AND** the user has `subscription_until > now`
- **THEN** the system SHALL NOT decrement `credits`

#### Scenario: Generation error does not consume credit
- **WHEN** generation ends with an error
- **THEN** the system SHALL NOT decrement `credits`

### Requirement: Purchase prompt on blocked generation
The bot SHALL present a purchase prompt with available offers when generation is blocked due to no access.

#### Scenario: Blocked generation shows purchase options
- **WHEN** generation returns `needs_purchase`
- **THEN** the bot SHALL display a message explaining access is needed
- **AND** SHALL show active offers with inline purchase buttons

### Requirement: User profile endpoint
The system SHALL expose `GET /me` with the user's credit balance and subscription expiry.

#### Scenario: User checks profile
- **WHEN** an authenticated user calls `GET /me`
- **THEN** the response SHALL include `credits`, `subscription_until`, and `purchase_history`
