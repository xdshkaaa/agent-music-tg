## ADDED Requirements

### Requirement: Quick credit check via /credits

The bot SHALL respond to `/credits` with the user's remaining credits count and subscription status in a concise format, using the same data source as `/profile`.

#### Scenario: /credits with active subscription

- **WHEN** user sends `/credits`
- **THEN** the bot responds with credit count and subscription expiry date

#### Scenario: /credits with only credits

- **WHEN** user sends `/credits` and has credits > 0 but no subscription
- **THEN** the bot responds with the remaining credit count

#### Scenario: /credits with no access

- **WHEN** user sends `/credits` and has 0 credits and no subscription
- **THEN** the bot responds with a message indicating no access and links to /buy
