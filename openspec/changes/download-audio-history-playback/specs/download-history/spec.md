# download-history

## ADDED Requirements

### Requirement: Downloads persisted per user
Every download job SHALL be recorded in a `downloads` table keyed to the user's chat id, storing playlist name, track list with per-track statuses, overall status, and creation time.

#### Scenario: Download recorded
- **WHEN** a download job is created
- **THEN** a row exists in `downloads` with the user's chat id, playlist name, tracks, and timestamps, visible in subsequent history queries

### Requirement: History listing API
The server SHALL expose `GET /api/downloads` returning the authenticated user's downloads, newest first. Users SHALL only ever see their own downloads.

#### Scenario: User lists their history
- **WHEN** an authorized user requests their downloads
- **THEN** the server returns that user's download records ordered by creation time descending

#### Scenario: Isolation between users
- **WHEN** user A requests downloads
- **THEN** no records belonging to user B are returned

### Requirement: Re-download from history
The server SHALL expose `POST /api/downloads/:id/resend` which re-sends the recorded playlist's audio to the user's chat, reusing cached `file_id`s where available. The endpoint SHALL reject ids not owned by the requester.

#### Scenario: Re-send succeeds
- **WHEN** the user triggers re-download on one of their history entries
- **THEN** the tracks are sent to their chat again (instantly for cached tracks) and the entry's status reflects the new delivery

#### Scenario: Foreign id rejected
- **WHEN** the user calls resend with another user's download id
- **THEN** the server responds `404`

### Requirement: Delete from history
The server SHALL expose `DELETE /api/downloads/:id` removing the user's history entry. Deletion SHALL NOT remove cached audio `file_id`s (they are shared across users).

#### Scenario: Entry deleted
- **WHEN** the user deletes a history entry they own
- **THEN** the entry no longer appears in `GET /api/downloads`, and cached audio for its tracks remains available

### Requirement: «Загрузки» view in profile
The Mini App profile screen SHALL provide a tab switch between «Покупки» and «Загрузки». The «Загрузки» view SHALL list download history entries (playlist name, date, track count, status) with re-download and delete actions on each entry.

#### Scenario: User opens downloads history
- **WHEN** the user switches the profile view to «Загрузки»
- **THEN** their download history is shown newest first, with an empty state when there are no downloads

#### Scenario: Re-download from UI
- **WHEN** the user taps the re-download action on an entry
- **THEN** the app calls the resend endpoint and shows confirmation that tracks are being sent to chat

#### Scenario: Delete with confirmation
- **WHEN** the user taps the delete action on an entry
- **THEN** the app asks for confirmation before calling the delete endpoint and removes the entry from the list on success
