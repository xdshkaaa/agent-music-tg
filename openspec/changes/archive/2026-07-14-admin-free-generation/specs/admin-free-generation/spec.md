## ADDED Requirements

### Requirement: Admin bypasses paywall for playlist generation
The system SHALL allow admin users to generate playlists without consuming credits or requiring an active subscription. Admin status is determined by the `is_admin` flag in the `allowlist` table.

#### Scenario: Admin with zero credits generates a playlist
- **WHEN** an admin user (is_admin=1) calls `/generate` or `POST /api/generate` with a prompt
- **AND** the admin has 0 credits and no active subscription
- **THEN** the system SHALL accept the request and proceed with generation
- **AND** the admin's credit balance SHALL remain at 0

#### Scenario: Admin's generation is recorded in history
- **WHEN** an admin successfully generates a playlist
- **THEN** the generation SHALL be recorded in the `generations` table
- **AND** the admin's credits SHALL NOT be decremented

#### Scenario: Non-admin user without credits sees purchase prompt
- **WHEN** a non-admin user with 0 credits and no subscription calls `/generate`
- **THEN** the system SHALL return `{status: "needs_purchase"}` as before
- **AND** the user SHALL see the purchase prompt
