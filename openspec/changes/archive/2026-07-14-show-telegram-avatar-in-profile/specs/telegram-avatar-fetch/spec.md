## ADDED Requirements

### Requirement: Fetch user profile photo
The system SHALL fetch the user's Telegram profile photo when the user sends `/start`.

#### Scenario: User has a profile photo
- **WHEN** user sends `/start`
- **THEN** system calls `getUserProfilePhotos` with `limit: 1`
- **THEN** system selects the largest photo from the result
- **THEN** system stores the `file_id` in the `users` table's `photo_file_id` column

#### Scenario: User has no profile photo
- **WHEN** user sends `/start`
- **WHEN** `getUserProfilePhotos` returns an empty array
- **THEN** system SHALL NOT store any `photo_file_id`
- **THEN** system SHALL NOT throw or show any error

### Requirement: Cache photo file_id
The system SHALL cache the photo file_id in SQLite for the lifetime of the user session.

#### Scenario: Fetch only on /start
- **WHEN** user sends any command other than `/start`
- **THEN** system SHALL NOT call `getUserProfilePhotos`
- **THEN** system SHALL use the previously stored `photo_file_id` from the database
