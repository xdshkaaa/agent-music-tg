## ADDED Requirements

### Requirement: Send profile photo with /profile
The bot SHALL send the user's Telegram profile photo when the user sends `/profile`.

#### Scenario: Photo available
- **WHEN** user sends `/profile`
- **WHEN** the user has a stored `photo_file_id`
- **THEN** bot SHALL call `ctx.replyWithPhoto(fileId, { caption })`
- **THEN** the caption SHALL contain the same profile text as before (credits, subscription, purchases)

#### Scenario: Photo not available
- **WHEN** user sends `/profile`
- **WHEN** the user has no stored `photo_file_id`
- **THEN** bot SHALL reply with text only (current behavior)
- **THEN** no error SHALL be thrown
