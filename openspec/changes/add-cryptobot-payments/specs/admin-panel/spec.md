## ADDED Requirements

### Requirement: Admin access control

The admin panel SHALL be accessible only to users designated as admins (via `ADMIN_CHAT_IDS` or the allowlist admin flag). All admin commands and admin API endpoints SHALL reject non-admin callers, independent of whether any UI renders the controls.

#### Scenario: Non-admin blocked

- **WHEN** a non-admin user invokes an admin command or calls an admin API endpoint
- **THEN** the system rejects the request and performs no admin action

#### Scenario: Admin allowed

- **WHEN** an admin invokes an admin command
- **THEN** the system serves the admin panel

### Requirement: Statistics

The admin panel SHALL report statistics including total users, number of paid purchases, and total revenue. Revenue SHALL be computed from fulfilled invoices only.

#### Scenario: Admin views statistics

- **WHEN** an admin opens statistics
- **THEN** the system shows total users, count of paid purchases, and total revenue from fulfilled invoices

### Requirement: Offer management

The admin panel SHALL let admins create, edit, activate/deactivate, and delete offers, setting title, price/asset, and grant (credits or subscription days). Changes SHALL take effect for subsequent user offer listings and invoice creation.

#### Scenario: Admin creates an offer

- **WHEN** an admin creates an offer with a title, price, and grant
- **THEN** the offer is stored and, if active, appears in the user offer list

#### Scenario: Admin deactivates an offer

- **WHEN** an admin marks an offer inactive
- **THEN** the offer no longer appears to users and cannot be purchased

### Requirement: Broadcast

The admin panel SHALL let admins send a message to all known users. The system SHALL record every user who has started the bot so they form the broadcast audience, and SHALL continue sending to remaining users if delivery to some recipients fails (e.g., blocked bot).

#### Scenario: Admin broadcasts

- **WHEN** an admin sends a broadcast message
- **THEN** the system attempts delivery to every recorded user and reports how many succeeded

#### Scenario: Broadcast tolerates delivery failures

- **WHEN** delivery to some users fails
- **THEN** the system skips those users and still delivers to the rest

### Requirement: Shop settings

The admin panel SHALL let admins edit shop settings — shop name, support contact, and about text — which the bot uses in user-facing messages such as the start/about/support flows.

#### Scenario: Admin edits shop settings

- **WHEN** an admin updates the shop name, support contact, or about text
- **THEN** the new values are persisted and used in subsequent user-facing messages
