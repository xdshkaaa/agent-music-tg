## ADDED Requirements

### Requirement: System records all grant operations

The system SHALL record every credit grant, subscription grant, and subscription revocation in the `grant_history` table.

#### Scenario: Grant history written on credit grant
- **WHEN** an admin grants credits via `POST /admin/users/:chatId/credits`
- **THEN** a row is inserted with `chat_id`, `type='credits'`, `amount`, `granted_by`, `created_at`

#### Scenario: Grant history written on subscription grant
- **WHEN** an admin extends subscription via `POST /admin/users/:chatId/subscription`
- **THEN** a row is inserted with `chat_id`, `type='subscription'`, `amount=<days>`, `granted_by`, `created_at`

#### Scenario: Grant history written on subscription revoke
- **WHEN** an admin revokes subscription via `DELETE /admin/users/:chatId/subscription`
- **THEN** a row is inserted with `chat_id`, `type='subscription_revoked'`, `amount=0`, `granted_by`, `created_at`

#### Scenario: System grants write history with granted_by=0
- **WHEN** a purchase fulfillment or trial claim grants credits/days (no admin involved)
- **THEN** a `grant_history` row is written with `granted_by=0`

### Requirement: Admin can view grant history for a specific user

The system SHALL provide an endpoint to retrieve grant history for a given user.

#### Scenario: View user grant history in admin panel
- **WHEN** an admin selects a user in the "Выдача" tab
- **THEN** the UI displays a list of all grant operations for that user: type, amount, timestamp, who granted it

#### Scenario: Fetch via API
- **WHEN** an admin calls `GET /admin/grant-history?chatId=12345`
- **THEN** the server returns `{ history: [{ id, chatId, type, amount, grantedBy, createdAt }, ...] }` ordered by `created_at DESC`

### Requirement: Admin can view all grant history

The system SHALL provide an endpoint to retrieve the global grant log with pagination.

#### Scenario: View global grant log
- **WHEN** an admin navigates to the "История выдач" section in the "Выдача" tab
- **THEN** the UI shows a paginated feed of all grant operations across all users, most recent first

#### Scenario: Pagination
- **WHEN** an admin calls `GET /admin/grant-history?limit=50&offset=0`
- **THEN** the server returns `{ history: [...], total: <count> }` with the first 50 records
