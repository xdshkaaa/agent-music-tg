## ADDED Requirements

### Requirement: Inline credit grant form
The admin UsersPanel SHALL provide an inline form for granting/spending credits instead of `prompt()`.

#### Scenario: Input and submit button shown per user
- **WHEN** admin views users list
- **THEN** each user row SHALL display a number input and "Выдать credits" button

#### Scenario: Validation prevents empty submission
- **WHEN** admin clicks submit with empty or zero value
- **THEN** form SHALL NOT submit

### Requirement: Inline subscription extension form
The admin UsersPanel SHALL provide an inline form for extending subscription instead of `prompt()`.

#### Scenario: Input and submit button shown per user
- **WHEN** admin views users list
- **THEN** each user row SHALL display a number input and "Продлить подписку" button

### Requirement: Inline access management form
The admin AccessPanel SHALL provide an inline form for adding users instead of `prompt()`.

#### Scenario: Input fields for chat ID and admin toggle
- **WHEN** admin clicks "Добавить пользователя"
- **THEN** an inline form SHALL appear with a chat ID input and admin toggle checkbox

### Requirement: Inline setting editor
The admin UnifiedSettingsPanel SHALL provide an inline editor for setting values instead of `prompt()`.

#### Scenario: Click to edit in place
- **WHEN** admin clicks a setting row
- **THEN** the value SHALL become editable inline (no native prompt)

### Requirement: Inline delete confirmation
All admin panels SHALL use inline confirmation dialogs instead of `window.confirm()`.

#### Scenario: Two-button confirm dialog
- **WHEN** admin triggers a destructive action (delete offer, remove user, clear download history)
- **THEN** an inline confirmation SHALL appear with "Подтвердить" and "Отмена" buttons
