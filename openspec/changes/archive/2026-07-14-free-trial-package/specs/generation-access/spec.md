# generation-access — delta

## ADDED Requirements

### Requirement: One-time free trial of 10 generations valid 3 days
The system SHALL let each Telegram account claim a free trial exactly once, ever. Claiming grants 10 trial generation credits that expire 3 days (72 hours) after the moment of claiming. The grant MUST be applied atomically so that concurrent or repeated claim attempts can never grant more than once. Claiming MUST NOT create an invoice or involve any payment provider.

#### Scenario: First claim grants the trial
- **WHEN** a user who has never claimed the trial claims it
- **THEN** they receive 10 trial credits with an expiry 3 days from now, and the claim is recorded permanently

#### Scenario: Second claim is rejected
- **WHEN** a user who has already claimed the trial (even if it is expired or fully spent) claims again
- **THEN** no grant is applied and the attempt is rejected as already claimed

#### Scenario: Claim creates no invoice
- **WHEN** a user claims the trial
- **THEN** no invoice record is created and no payment provider is contacted

### Requirement: Active trial grants generation access
An active trial (trial credits remaining AND expiry in the future) SHALL grant generation access, in addition to the existing paid-credit and subscription checks. Expired or exhausted trial credits SHALL NOT grant access.

#### Scenario: Access during active trial
- **WHEN** a user with 0 paid credits, no subscription, and an active trial requests a generation
- **THEN** access is granted

#### Scenario: No access after trial expiry
- **WHEN** a user's trial expiry has passed with trial credits remaining, and they have no paid credits or subscription
- **THEN** access is denied

#### Scenario: No access after trial exhaustion
- **WHEN** a user has spent all 10 trial credits within the 3 days and has no paid credits or subscription
- **THEN** access is denied

### Requirement: Trial credits are consumed before paid credits
When consuming access for a successful generation, the system SHALL charge in this order: subscription users are not charged; otherwise one active trial credit is consumed; only when no active trial credit is available is one paid credit consumed. An expired trial credit MUST never be consumed.

#### Scenario: Trial credit consumed first
- **WHEN** a user with an active trial and paid credits completes a generation
- **THEN** their trial balance decreases by one and their paid balance is unchanged

#### Scenario: Fallback to paid credits after expiry
- **WHEN** a user with an expired trial (credits remaining) and paid credits completes a generation
- **THEN** one paid credit is consumed and the trial balance is unchanged

#### Scenario: Subscriber is not charged
- **WHEN** a user with a live subscription and an active trial completes a generation
- **THEN** neither trial nor paid credits are consumed

### Requirement: Trial status is exposed to clients
The authenticated user endpoint SHALL report the trial state — whether it was claimed, whether it is currently active, remaining trial credits, and the expiry timestamp — as an additive field that does not break existing clients.

#### Scenario: Unclaimed user
- **WHEN** a user who never claimed the trial fetches their profile
- **THEN** the response shows the trial as unclaimed and inactive

#### Scenario: Active trial reported
- **WHEN** a user with 7 remaining trial credits and a future expiry fetches their profile
- **THEN** the response shows claimed, active, 7 credits left, and the expiry timestamp
