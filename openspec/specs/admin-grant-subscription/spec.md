# admin-grant-subscription Specification

## Purpose
TBD - created by archiving change admin-subscriptions-requests. Update Purpose after archive.
## Requirements
### Requirement: Admin can grant subscription days to a user

The system SHALL allow an admin to extend a user's subscription by a specified number of days.

#### Scenario: Grant subscription days
- **WHEN** an admin submits a positive number of days via `POST /admin/users/:chatId/subscription` with `{ days: 30 }`
- **THEN** the user's `subscription_until` is extended by 30 days from `max(now, current subscription_until)` AND a row is inserted into `grant_history` with `type='subscription', amount=30, granted_by=<admin_chat_id>`

#### Scenario: Extend already-active subscription
- **WHEN** a user already has a subscription until August 15 and an admin grants 30 days
- **THEN** the new expiry is September 14 (30 days added to August 15, not from today)

#### Scenario: Grant subscription to a new user
- **WHEN** an admin grants subscription days to a chat_id that has no user row yet
- **THEN** a user row is created (`ensureUser`) and subscription is set from `now + days * 86400` AND a `grant_history` row is written

### Requirement: Admin can revoke a subscription

The system SHALL allow an admin to remove a user's subscription entirely.

#### Scenario: Revoke subscription
- **WHEN** an admin calls `DELETE /admin/users/:chatId/subscription`
- **THEN** the user's `subscription_until` is set to NULL AND a row is inserted into `grant_history` with `type='subscription_revoked', amount=0, granted_by=<admin_chat_id>`

#### Scenario: Revoke already-expired subscription
- **WHEN** an admin revokes a subscription for a user whose subscription has already expired
- **THEN** `subscription_until` remains NULL (no-op on data) AND a `grant_history` row is written

