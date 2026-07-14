## ADDED Requirements

### Requirement: Admin can list all users

Admin SHALL be able to view a list of all registered users with their credits, subscription status, username, and dates.

#### Scenario: List users
- **WHEN** admin calls GET `/api/admin/users`
- **THEN** response SHALL be `{ users: [{ chatId, username, photoFileId, credits, subscriptionUntil, firstSeen, lastSeen }] }`

### Requirement: Admin can grant credits to a user

Admin SHALL be able to add credits to any user's balance. The amount SHALL be positive.

#### Scenario: Grant credits
- **WHEN** admin submits POST `/api/admin/users/:chatId/credits` with `{ amount: 10 }`
- **THEN** the user's `credits` SHALL increase by 10
- **THEN** response SHALL be `{ credits: <newBalance> }`

### Requirement: Admin can deduct credits from a user

Admin SHALL be able to deduct credits from any user. The amount SHALL be positive and the user's balance SHALL NOT go negative.

#### Scenario: Deduct credits
- **WHEN** admin submits POST `/api/admin/users/:chatId/credits` with `{ amount: -5 }`
- **THEN** the user's `credits` SHALL decrease by 5
- **THEN** response SHALL be `{ credits: <newBalance> }`

#### Scenario: Deduct below zero
- **WHEN** admin tries to deduct more credits than the user has
- **THEN** response SHALL be `{ error: "insufficient credits" }` with status 400

### Requirement: Admin can extend user subscription

Admin SHALL be able to extend a user's subscription by a given number of days.

#### Scenario: Extend subscription
- **WHEN** admin submits POST `/api/admin/users/:chatId/subscription` with `{ days: 30 }`
- **THEN** the user's `subscription_until` SHALL be extended by 30 days from max(now, current expiry)
- **THEN** response SHALL be `{ subscriptionUntil: <timestamp> }`
