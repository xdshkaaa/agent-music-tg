# generation-access (delta)

## ADDED Requirements

### Requirement: Exactly one credit is spent per successful generation on every entry path
The system SHALL consume exactly one generation credit (trial before paid) for each successful generation, on every entry path: JSON generate, SSE stream generate, clarify resume (JSON and stream), extend (JSON and stream), and the bot. Clarification rounds, rate-limited requests, and failed generations MUST NOT consume a credit. A single successful generation MUST NOT be charged twice.

#### Scenario: Stream generation spends one credit
- **WHEN** a credit user completes a successful generation via the SSE stream endpoint
- **THEN** their balance decreases by exactly one

#### Scenario: Clarify round is free
- **WHEN** a generation request returns a clarification question
- **THEN** no credit is consumed

#### Scenario: Failed generation is free
- **WHEN** a generation fails (no tracks resolved, max iterations, provider error)
- **THEN** no credit is consumed

#### Scenario: Zero balance denies access
- **WHEN** a user with 0 credits, no active trial, and no active subscription requests a generation on any path
- **THEN** the outcome is `needs_purchase` and no LLM call is made

### Requirement: Active subscription grants unmetered credit-free access within the rate limit
A user whose `subscriptionUntil` is in the future SHALL generate without consuming trial or paid credits, subject only to the subscription hourly rate limit. When the subscription expires, access falls back to remaining credits/trial, and to `needs_purchase` when none remain.

#### Scenario: Subscriber keeps credits
- **WHEN** a user with a live subscription and 3 paid credits completes a generation
- **THEN** their credit balance remains 3

#### Scenario: Expired subscription falls back to credits
- **WHEN** a user's subscription expired yesterday and they have 2 paid credits
- **THEN** a successful generation consumes one paid credit

#### Scenario: Expired subscription with no credits denies access
- **WHEN** a user's subscription expired and they have no credits and no active trial
- **THEN** the outcome is `needs_purchase`
