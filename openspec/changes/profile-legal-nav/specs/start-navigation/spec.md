# start-navigation Specification (delta)

## MODIFIED Requirements

### Requirement: Navigation buttons dispatch to correct section

Each navigation button SHALL open the corresponding bot section when tapped.

Pressing «Купить», «Профиль», «История», or «Поддержка» SHALL render the corresponding section **in the same message** by editing the origin message's text and keyboard (`editMessageText`), not by sending a new message.

Pressing «Админка» SHALL show the admin panel as its own message (admin flows are multi-step and excluded from in-place navigation).

Section content SHALL match the corresponding slash command's content, with one exception: the in-place profile view renders as text only (no avatar photo), because a text message cannot be edited into a photo message. The `/profile` slash command keeps its photo-card behavior.

Offers with image icons SHALL still be delivered as separate photo cards below the navigation message when the buy section is opened.

If editing the origin message fails (message too old, identical content), the bot SHALL fall back to sending the section as a new message.

#### Scenario: Tap «Купить» button
- **WHEN** user taps «Купить» in the /start navigation
- **THEN** the /start message is edited to show the offers list with a «Назад» button
- **AND** offers with image icons are sent as separate photo cards

#### Scenario: Tap «Профиль» button
- **WHEN** user taps «Профиль» in the /start navigation
- **THEN** the /start message is edited to show the profile text (no photo) with legal document buttons and «Назад»

#### Scenario: Tap «История» button
- **WHEN** user taps «История» in the /start navigation
- **THEN** the /start message is edited to show generation history with «Назад»

#### Scenario: Tap «Поддержка» button
- **WHEN** user taps «Поддержка» in the /start navigation
- **THEN** the /start message is edited to show the support contact with «Назад»

#### Scenario: Tap «Админка» button
- **WHEN** admin taps «Админка»
- **THEN** bot sends the admin panel as a new message (origin message unchanged)

#### Scenario: Edit fails on an old message
- **WHEN** a nav button is tapped on a message Telegram no longer allows editing
- **THEN** bot sends the section content as a new message instead

## ADDED Requirements

### Requirement: Back button returns to main menu in-place

Every in-place section view (buy, profile, history, support) SHALL include a «Назад» button. Pressing it SHALL edit the same message back to the main /start menu text and navigation keyboard.

#### Scenario: Back from profile
- **WHEN** user taps «Назад» in the in-place profile view
- **THEN** the message is edited back to the /start menu text with the full navigation keyboard

#### Scenario: Navigate between sections without new messages
- **WHEN** user taps «Профиль», then «Назад», then «Купить»
- **THEN** all transitions happen in the same message and no new navigation messages are sent
