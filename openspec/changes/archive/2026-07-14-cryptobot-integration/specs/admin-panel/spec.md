## ADDED Requirements

### Requirement: Admin statistics
The system SHALL provide a `GET /admin/stats` endpoint returning aggregated data about users, sales, and revenue.

#### Scenario: Admin views statistics
- **WHEN** an admin calls `GET /admin/stats`
- **THEN** the response SHALL include total users, total sales, total revenue, active subscriptions count, and credits sold

### Requirement: Manage offers
The system SHALL allow admins to create, read, update, and deactivate offers via API endpoints.

#### Scenario: Admin creates an offer
- **WHEN** an admin calls `POST /admin/offers` with title, amount, asset, grant_kind, grant_amount
- **THEN** a new offer SHALL be created and returned

#### Scenario: Admin lists all offers
- **WHEN** an admin calls `GET /admin/offers`
- **THEN** all offers (active and inactive) SHALL be returned

#### Scenario: Admin deactivates an offer
- **WHEN** an admin calls `PATCH /admin/offers/:id` with `active: false`
- **THEN** the offer SHALL be deactivated
- **AND** no new purchases SHALL be allowed on this offer

### Requirement: Broadcast messages
The system SHALL allow admins to broadcast a message to all users.

#### Scenario: Admin sends broadcast
- **WHEN** an admin calls `POST /admin/broadcast` with a message text
- **THEN** the system SHALL send the message to every user in the `users` table
- **AND** the response SHALL report the count of successful sends and failures

### Requirement: Shop settings management
The system SHALL allow admins to view and update shop settings (shop name, support contact, about text).

#### Scenario: Admin updates shop settings
- **WHEN** an admin calls `POST /admin/shop-settings` with new values
- **THEN** the settings SHALL be stored in the `settings` KV table
- **AND** the bot/about messages SHALL reflect the new values

### Requirement: Bot admin inline menu
The system SHALL provide a `/admin` command with an inline keyboard menu for admins.

#### Scenario: Admin opens admin panel
- **WHEN** an admin sends `/admin`
- **THEN** the bot SHALL show an inline keyboard with buttons: Statistics, Offers, Broadcast, Settings
- **AND** each button SHALL start a callback query flow for the respective function

#### Scenario: Non-admin sends /admin
- **WHEN** a non-admin user sends `/admin`
- **THEN** the bot SHALL reply with an access denied message
