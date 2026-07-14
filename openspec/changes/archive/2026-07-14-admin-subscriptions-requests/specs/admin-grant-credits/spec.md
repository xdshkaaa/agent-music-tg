## ADDED Requirements

### Requirement: Admin can grant credits to a user

The system SHALL allow an admin to grant or deduct credits (generation requests) for a specific user.

#### Scenario: Grant positive credits
- **WHEN** an admin submits a positive amount via `POST /admin/users/:chatId/credits` with `{ amount: 10 }`
- **THEN** the user's `credits` balance increases by 10 AND a row is inserted into `grant_history` with `type='credits', amount=10, granted_by=<admin_chat_id>`

#### Scenario: Deduct credits
- **WHEN** an admin submits a negative amount via `POST /admin/users/:chatId/credits` with `{ amount: -5 }`
- **THEN** the user's `credits` balance decreases by 5 AND a row is inserted into `grant_history` with `type='credits', amount=-5, granted_by=<admin_chat_id>`

#### Scenario: Cannot deduct more credits than available
- **WHEN** an admin submits `{ amount: -100 }` but the user has only 30 credits
- **THEN** the server returns 400 with `{ error: "insufficient credits" }` AND no `grant_history` row is written

#### Scenario: Admin finds user by chatId in the UI
- **WHEN** an admin opens the "Выдача" tab and types a chat ID or username into the search field
- **THEN** the user list is filtered client-side to show matching users only

#### Scenario: Admin sees current balance before granting
- **WHEN** a user is selected in the "Выдача" tab
- **THEN** the admin sees the user's current credits balance, subscription status, and last activity
