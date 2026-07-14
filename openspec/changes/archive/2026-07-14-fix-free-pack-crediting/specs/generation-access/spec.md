## MODIFIED Requirements

### Requirement: Active trial grants generation access
An active trial (trial credits remaining AND expiry in the future) SHALL grant generation access, in addition to the existing paid-credit and subscription checks. Expired or exhausted trial credits SHALL NOT grant access. The Bot SHALL NOT claim the trial when payments are disabled, matching the API endpoint behaviour.

#### Scenario: Access during active trial
- **WHEN** a user with 0 paid credits, no subscription, and an active trial requests a generation
- **THEN** access is granted

#### Scenario: No access after trial expiry
- **WHEN** a user's trial expiry has passed with trial credits remaining, and they have no paid credits or subscription
- **THEN** access is denied

#### Scenario: No access after trial exhaustion
- **WHEN** a user has spent all 10 trial credits within the 3 days and has no paid credits or subscription
- **THEN** access is denied

#### Scenario: Bot handler does not claim when payments disabled
- **WHEN** a user taps the free trial button in the bot while payments are disabled
- **THEN** the trial is NOT claimed and the user is informed the shop is unavailable

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

### Requirement: Trial keyboard updates after claim
After the Bot claims the trial, the inline keyboard on the original message SHALL be edited to remove the trial button, preventing repeated attempts.

#### Scenario: Keyboard cleared after successful claim
- **WHEN** a user claims the trial via the bot button
- **THEN** the original message's keyboard is updated to remove the trial:claim button

#### Scenario: Stale button does not re-claim
- **WHEN** a user taps a stale trial button after having already claimed
- **THEN** the handler returns "already claimed" without granting
