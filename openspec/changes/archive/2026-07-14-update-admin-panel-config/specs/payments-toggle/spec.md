## ADDED Requirements

### Requirement: Admin can view payments enabled status

Admin SHALL be able to see whether payments are currently enabled, with indication of whether the value is from env or DB override.

#### Scenario: View payments config
- **WHEN** admin calls GET `/api/admin/payments-config`
- **THEN** response SHALL be `{ paymentsEnabled: boolean, source: "env" | "db" }`

### Requirement: Admin can enable/disable payments at runtime

Admin SHALL be able to toggle payments on or off without restarting the server. When payments are disabled, users SHALL NOT be able to create new invoices and the shop SHALL show payments as unavailable.

#### Scenario: Disable payments
- **WHEN** admin submits POST `/api/admin/payments-config` with `{ paymentsEnabled: false }`
- **THEN** `payments_enabled` SHALL be set to `"false"` in settings table
- **THEN** subsequent POST `/api/invoices` SHALL return 503 with `{ error: "payments disabled" }`
- **THEN** GET `/api/offers` SHALL still list offers (visibility is not affected)

#### Scenario: Re-enable payments
- **WHEN** admin submits POST `/api/admin/payments-config` with `{ paymentsEnabled: true }`
- **THEN** `payments_enabled` setting SHALL be set to `"true"` in DB
- **THEN** invoice creation SHALL work again

#### Scenario: Reset to env default
- **WHEN** admin submits POST `/api/admin/payments-config` with `{ paymentsEnabled: null }`
- **THEN** the `payments_enabled` key SHALL be deleted from settings
- **THEN** the system SHALL fall back to `env.paymentsEnabled`
