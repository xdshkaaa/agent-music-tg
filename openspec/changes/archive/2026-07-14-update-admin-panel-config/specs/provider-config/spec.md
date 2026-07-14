## ADDED Requirements

### Requirement: Admin can view provider configuration

Admin SHALL be able to see all AI providers with their env defaults and any DB-level overrides.

#### Scenario: View provider config
- **WHEN** admin calls GET `/api/admin/provider-config`
- **THEN** response SHALL contain a list of providers with:
  - `id`: provider identifier
  - `envDefaults`: object with `{ model, baseUrl, apiKeyConfigured: boolean }`
  - `dbOverrides`: object with current DB overrides `{ model?, baseUrl? }`
  - `effective`: resolved config (DB override or env default)

### Requirement: Admin can override provider model

Admin SHALL be able to set a custom model for any provider, stored in DB and overriding the env default.

#### Scenario: Set provider model override
- **WHEN** admin submits POST `/api/admin/provider-config/:id` with `{ model: "claude-sonnet-5" }`
- **THEN** the model override SHALL be stored in settings as `provider:<id>:model`
- **THEN** the provider SHALL use the override on next generation
- **THEN** response SHALL contain the updated effective config

#### Scenario: Clear provider model override
- **WHEN** admin submits POST `/api/admin/provider-config/:id` with `{ model: null }`
- **THEN** the DB override SHALL be removed
- **THEN** the provider SHALL fall back to env default

### Requirement: Admin can override provider base URL

Admin SHALL be able to set a custom base URL for providers that support it (opencode, ollama).

#### Scenario: Set base URL override
- **WHEN** admin submits POST `/api/admin/provider-config/:id` with `{ baseUrl: "https://custom.url/v1" }`
- **THEN** the base URL override SHALL be stored in settings as `provider:<id>:base_url`
- **THEN** the provider SHALL use the override on next generation
- **THEN** response SHALL contain the updated effective config
