## ADDED Requirements

### Requirement: Admin can view all key-value settings

Admin SHALL be able to view every entry in the `settings` table in one unified view.

#### Scenario: List all settings
- **WHEN** admin calls GET `/api/admin/all-settings`
- **THEN** response SHALL be `{ settings: [{ key: string, value: string }] }` with all rows from the `settings` table

### Requirement: Admin can edit any setting value

Admin SHALL be able to update the value of any setting by key.

#### Scenario: Update setting
- **WHEN** admin submits POST `/api/admin/all-settings/:key` with `{ value: "new-value" }`
- **THEN** the setting SHALL be upserted in the `settings` table
- **THEN** response SHALL be `{ ok: true }`

#### Scenario: Clear/delete setting
- **WHEN** admin submits POST `/api/admin/all-settings/:key` with `{ value: null }`
- **THEN** the key SHALL be deleted from the `settings` table
- **THEN** response SHALL be `{ ok: true }`

### Requirement: Admin can add a new setting

Admin SHALL be able to create a new key-value pair that didn't exist before.

#### Scenario: Create new setting
- **WHEN** admin submits POST `/api/admin/all-settings` with `{ key: "custom_setting", value: "custom_value" }`
- **THEN** the new key-value pair SHALL be inserted
- **THEN** response SHALL be `{ ok: true }`
