## ADDED Requirements

### Requirement: Chat allowlist gate
The system SHALL maintain a persisted allowlist of Telegram chat IDs and SHALL reject, at the earliest possible point (bot update handler and Mini App API middleware alike), any request whose chat/user ID is not on the allowlist.

#### Scenario: Allowed chat sends a message
- **WHEN** a Telegram update arrives from a chat ID present in the allowlist
- **THEN** the bot processes the update normally

#### Scenario: Unknown chat sends a message
- **WHEN** a Telegram update arrives from a chat ID not present in the allowlist
- **THEN** the bot sends no reply and performs no further processing for that update

#### Scenario: Unknown chat calls the Mini App API directly
- **WHEN** an HTTP request reaches the Mini App API with `initData` resolving to a chat ID not on the allowlist
- **THEN** the API responds with an authorization error and performs no side effects

### Requirement: Admin role distinction
The system SHALL distinguish admin chat IDs from regular allowed chat IDs, both drawn from (and a subset of) the allowlist, and SHALL expose this distinction to server-side authorization checks.

#### Scenario: Admin chat is identified
- **WHEN** a request's chat ID matches an entry flagged as admin
- **THEN** the system treats the request as eligible for admin-only actions

#### Scenario: Regular allowed chat is identified
- **WHEN** a request's chat ID is on the allowlist but not flagged as admin
- **THEN** the system treats the request as eligible only for regular-user actions

### Requirement: Admin-only provider and backend controls are enforced server-side
The system SHALL reject any attempt to read or change the active AI provider or active music backend setting from a non-admin chat ID, at the API/bot-command layer, independent of what any client UI displays.

#### Scenario: Admin changes the active AI provider
- **WHEN** an admin chat sends the provider-change command or Mini App action with a valid provider identifier
- **THEN** the system updates the active AI provider and confirms the change

#### Scenario: Regular user attempts to change the active AI provider
- **WHEN** a non-admin allowed chat sends the provider-change command or the equivalent Mini App API call
- **THEN** the system rejects the request with an authorization error and makes no change

#### Scenario: Regular user's Mini App never renders the settings panel
- **WHEN** a non-admin allowed chat opens the Mini App
- **THEN** the Mini App does not render the provider/backend settings panel or any control for it

#### Scenario: Admin's Mini App renders the settings panel
- **WHEN** an admin chat opens the Mini App
- **THEN** the Mini App renders the provider/backend settings panel with the current active values
