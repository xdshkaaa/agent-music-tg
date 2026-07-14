## ADDED Requirements

### Requirement: Profile displays support contact

The system SHALL display the configured support contact on the user's `/profile` page when `support_contact` is non-empty. The system SHALL NOT display a support section when `support_contact` is empty.

#### Scenario: Support contact is configured

- **WHEN** admin has set `support_contact` to a non-empty value (e.g. "@support_bot")
- **WHEN** user runs `/profile`
- **THEN** the profile message SHALL include a line showing the support contact

#### Scenario: Support contact is not configured

- **WHEN** `support_contact` is empty
- **WHEN** user runs `/profile`
- **THEN** the profile message SHALL NOT include any support-related line

### Requirement: Start menu removes support reference

The `/start` welcome message SHALL NOT include the "Поддержка 24/7" bullet point or any static support reference.

#### Scenario: User runs /start

- **WHEN** user runs `/start`
- **THEN** the welcome message SHALL include "Сгенерируй плейлист" and "Купи доступ" bullets
- **THEN** the welcome message SHALL NOT include "Поддержка 24/7" bullet
