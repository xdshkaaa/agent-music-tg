# legal-documents Specification (delta)

## ADDED Requirements

### Requirement: Legal document links in profile section

The bot's in-place profile view SHALL display inline URL buttons for legal documents:
- «Пользовательское соглашение» → https://telegra.ph/Polzovatelskoe-soglashenie-07-15-25
- «Политика конфиденциальности» → https://telegra.ph/Politika-konfidencialnosti-07-15-41
- «Политика возврата средств» → refund policy URL (configured constant)

Each button SHALL be a Telegram URL button that opens the document without sending a new message.

Legal document URLs SHALL be defined in a single constants module. A document whose URL is not yet configured (placeholder value) SHALL be omitted from the keyboard rather than rendered as a dead link.

#### Scenario: User opens profile via nav button
- **WHEN** user taps «Профиль» in the /start navigation
- **THEN** the profile view's keyboard contains URL buttons «Пользовательское соглашение» and «Политика конфиденциальности» pointing to the telegra.ph documents

#### Scenario: Refund policy URL not yet configured
- **WHEN** the refund policy URL constant is still the placeholder
- **THEN** the «Политика возврата средств» button is not shown in the profile keyboard

#### Scenario: Refund policy URL configured
- **WHEN** the refund policy URL constant holds a real URL
- **THEN** the profile keyboard includes «Политика возврата средств» as a URL button pointing to it
