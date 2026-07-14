## ADDED Requirements

### Requirement: Russian bot interface
All Telegram bot user-facing text SHALL be presented in Russian, including command replies, prompts, clarify questions framing, and error messages.

#### Scenario: Start command in Russian
- **WHEN** a user sends `/start`
- **THEN** the reply text and inline button label are in Russian

#### Scenario: Error replies in Russian
- **WHEN** playlist generation fails
- **THEN** the failure message shown to the user is in Russian

#### Scenario: Admin command feedback in Russian
- **WHEN** an admin uses `/provider` or `/backend`
- **THEN** the confirmation and error feedback are in Russian
- **AND** provider/backend technical ids MAY remain untranslated

### Requirement: Russian Mini App interface
All Mini App user-facing text SHALL be presented in Russian, including navigation, screen headings, body copy, input placeholders, button labels, and status/loading text.

#### Scenario: Prompt screen in Russian
- **WHEN** the prompt screen renders
- **THEN** its heading, description, placeholder, and generate button are in Russian

#### Scenario: Results screen in Russian
- **WHEN** a generated playlist is displayed
- **THEN** the open-in-app link labels and the "new playlist" action are in Russian

#### Scenario: Error banner in Russian
- **WHEN** an error occurs in the Mini App
- **THEN** the surrounding UI framing text is in Russian
