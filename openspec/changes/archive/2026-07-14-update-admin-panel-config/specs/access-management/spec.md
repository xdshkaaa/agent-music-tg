## ADDED Requirements

### Requirement: Admin can add user to allowlist

Admin SHALL be able to add a Telegram chat ID to the allowlist via API and Mini App UI. This grants the user access to the bot without requiring a server restart or env change.

#### Scenario: Successful add to allowlist
- **WHEN** admin submits POST `/api/admin/access/add` with `{ chatId: 12345, isAdmin: false }`
- **THEN** the user SHALL be inserted into `allowlist` table with `is_admin = 0`
- **THEN** response SHALL be `{ ok: true }`

#### Scenario: Duplicate chat ID
- **WHEN** admin submits add for an already-allowed chat ID
- **THEN** response SHALL be `{ ok: true }` (idempotent, no error)

### Requirement: Admin can remove user from allowlist

Admin SHALL be able to remove a user from the allowlist. The removed user loses access on their next interaction (existing session is not terminated).

#### Scenario: Successful remove from allowlist
- **WHEN** admin submits POST `/api/admin/access/remove` with `{ chatId: 12345 }`
- **THEN** the user SHALL be deleted from `allowlist` table
- **THEN** response SHALL be `{ ok: true }`

### Requirement: Admin can promote/demote admin role

Admin SHALL be able to promote a user to admin or demote them back to regular user.

#### Scenario: Promote to admin
- **WHEN** admin submits POST `/api/admin/access/set-role` with `{ chatId: 12345, isAdmin: true }`
- **THEN** user SHALL have `is_admin = 1` in `allowlist` table
- **THEN** response SHALL be `{ ok: true }`

#### Scenario: Demote from admin
- **WHEN** admin submits POST `/api/admin/access/set-role` with `{ chatId: 12345, isAdmin: false }`
- **THEN** user SHALL have `is_admin = 0` in `allowlist` table
- **THEN** response SHALL be `{ ok: true }`

### Requirement: GET endpoint returns allowlist

Admin SHALL be able to view the full allowlist with admin flags.

#### Scenario: List allowlist
- **WHEN** admin calls GET `/api/admin/access`
- **THEN** response SHALL be `{ entries: [{ chatId: number, isAdmin: boolean, createdAt: number }] }`
