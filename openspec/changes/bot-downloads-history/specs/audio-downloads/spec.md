## ADDED Requirements

### Requirement: Bot auto-audio deliveries are recorded in download history
The system SHALL record every bot-initiated auto-audio delivery (triggered after a playlist generation in the bot chat) as a `downloads` record owned by the generating chat's `chat_id`, identical in shape to Mini App-initiated downloads, so it appears in the user's Mini App «Загрузки» history.

#### Scenario: Bot generation creates a history entry
- **WHEN** a user generates a playlist in the bot and the audio is auto-delivered to their chat
- **THEN** a `downloads` row is created with that `chat_id`, the playlist name, the track list, and an initial status, and it is returned by `GET /api/downloads` for that user in the Mini App

#### Scenario: History entry reflects final status
- **WHEN** bot auto-delivery finishes (all sent, partially sent, or all failed)
- **THEN** the `downloads` row's status is updated to `done`, `partial`, or `failed` and per-track statuses reflect sent/failed

#### Scenario: Unavailable tracks are skipped but recorded
- **WHEN** a track's verification status is `unavailable` during bot auto-delivery
- **THEN** the track is not extracted, is marked `failed` in the record, and the final status still reflects the actually-delivered tracks

#### Scenario: Owner isolation preserved
- **WHEN** two different chats receive bot auto-deliveries
- **THEN** each chat sees only its own `downloads` entries via `GET /api/downloads`, and `resend`/`delete` are scoped to the owner
