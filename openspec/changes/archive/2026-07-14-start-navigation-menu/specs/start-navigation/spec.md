## ADDED Requirements

### Requirement: Navigation menu on /start

The `/start` command SHALL display an inline keyboard with navigation buttons for all major bot sections, replacing the current text-only command list.

The navigation keyboard SHALL contain:
- Full-width WebApp button «Открыть приложение» as the first row
- «Купить» and «Генерация» as the second row
- «Профиль» and «История» as the third row
- Full-width «Поддержка» as the fourth row
- Full-width «Админка» as the fifth row (ONLY if user is admin)

Each navigation button SHALL trigger the same action as the corresponding text command.

The `/start` message text SHALL be shortened — the text command list (`/app — ...`, `/buy — ...`, `/profile — ...`) SHALL be removed.

#### Scenario: User sends /start
- **WHEN** user sends `/start`
- **THEN** bot replies with the welcome message and inline navigation keyboard
- **AND** the keyboard contains «Открыть приложение» (WebApp), «Купить», «Генерация», «Профиль», «История», «Поддержка»

#### Scenario: Admin sends /start
- **WHEN** admin user sends `/start`
- **THEN** bot replies with the navigation keyboard that additionally includes «Админка» button

### Requirement: Navigation buttons dispatch to correct section

Each navigation button SHALL open the corresponding bot section when tapped.

Pressing «Купить» SHALL show the offers/purchase screen (same as `/buy`).
Pressing «Генерация» SHALL prompt for a generation query (same as `/generate`).
Pressing «Профиль» SHALL show the user profile (same as `/profile`).
Pressing «История» SHALL show generation history (same as `/history`).
Pressing «Поддержка» SHALL show the support contact (same as `/support`).
Pressing «Админка» SHALL show the admin panel (same as `/admin`).

#### Scenario: Tap «Купить» button
- **WHEN** user taps «Купить» button
- **THEN** bot responds with the offers/purchase screen (same content as `/buy` command)

#### Scenario: Tap «Генерация» button
- **WHEN** user taps «Генерация» button
- **THEN** bot responds with prompt to enter a generation query (same as `/generate` without arguments)

#### Scenario: Tap «Профиль» button
- **WHEN** user taps «Профиль» button
- **THEN** bot responds with user profile (same as `/profile`)

#### Scenario: Tap «История» button
- **WHEN** user taps «История» button
- **THEN** bot responds with generation history (same as `/history`)

#### Scenario: Tap «Поддержка» button
- **WHEN** user taps «Поддержка» button
- **THEN** bot responds with support contact info (same as `/support`)

#### Scenario: Admin taps «Админка» button
- **WHEN** admin user taps «Админка» button
- **THEN** bot responds with admin panel (same as `/admin`)

#### Scenario: Non-admin taps «Админка» button (edge case)
- **WHEN** non-admin user taps «Админка» button
- **THEN** nothing happens (button is not shown to non-admins, so this scenario should not occur)

### Requirement: Text commands still work

The existing text commands (`/buy`, `/generate`, `/profile`, `/history`, `/support`, `/admin`) SHALL continue to work exactly as before, regardless of the new navigation menu.

#### Scenario: User types /buy manually
- **WHEN** user types `/buy` in chat
- **THEN** bot responds with offers screen (same behavior as before the change)
