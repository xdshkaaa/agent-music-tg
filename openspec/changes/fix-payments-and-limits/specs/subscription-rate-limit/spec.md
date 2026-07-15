# subscription-rate-limit

## ADDED Requirements

### Requirement: Hourly generation limit for subscription access
When a user's generation access is granted by an active subscription (they have no paid credits and no active trial credits), the system SHALL limit them to at most `SUBSCRIPTION_HOURLY_LIMIT` successful generations within any rolling 60-minute window. The limit check MUST run before any LLM call. The default limit is 25; a value of 0 disables the limit. Admins and the `PAYMENTS_ENABLED=false` mode are never rate-limited.

#### Scenario: Subscriber under the limit generates normally
- **WHEN** a subscription-only user has completed 24 successful generations in the last hour and the limit is 25
- **THEN** a new generation starts and completes normally

#### Scenario: Subscriber at the limit is blocked before LLM call
- **WHEN** a subscription-only user has completed 25 successful generations in the last hour and the limit is 25
- **THEN** the request returns a `rate_limited` outcome with the timestamp when the oldest generation leaves the window, and no LLM call is made

#### Scenario: Credit user is not rate-limited
- **WHEN** a user with paid credits (regardless of subscription state) has completed 5 generations in the last hour
- **THEN** the generation proceeds and one credit is consumed on success

#### Scenario: Limit disabled by config
- **WHEN** `SUBSCRIPTION_HOURLY_LIMIT=0` and a subscription-only user has completed many generations in the last hour
- **THEN** the generation proceeds without a rate-limit check

#### Scenario: Window slides
- **WHEN** a subscription-only user hit the limit, and more than an hour has passed since the oldest counted generation
- **THEN** a new generation is allowed

### Requirement: Rate-limit outcome is surfaced to clients
The `rate_limited` outcome SHALL be delivered on every entry path: JSON generation endpoints respond with HTTP 429 and a body containing the retry timestamp; the SSE stream emits a terminal `rate_limited` frame with the retry timestamp and closes; the bot replies with a Russian message stating when generation becomes available again.

#### Scenario: JSON endpoint returns 429
- **WHEN** a rate-limited subscriber calls the JSON generate endpoint
- **THEN** the response is HTTP 429 with `retryAt` in the body

#### Scenario: SSE stream emits rate_limited frame
- **WHEN** a rate-limited subscriber opens the generation stream
- **THEN** the stream emits a `rate_limited` frame with `retryAt` and closes without any agent events

#### Scenario: Mini App shows retry time
- **WHEN** the Mini App receives a `rate_limited` outcome
- **THEN** it shows a Russian message with the time when generation is available again, and does not show the purchase prompt
