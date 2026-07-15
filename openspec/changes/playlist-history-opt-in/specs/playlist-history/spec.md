## ADDED Requirements

### Requirement: Playlists are not saved to history automatically
Generating a playlist SHALL NOT add it to the user's visible history. A generation row MAY exist internally (for extend/resume), but it MUST be excluded from history listings unless the user explicitly saves it.

#### Scenario: Fresh generation is absent from history
- **WHEN** a user generates a playlist and never saves it
- **THEN** that playlist does not appear in `GET /api/history`

### Requirement: User can save a generated playlist to history
The system SHALL let the authenticated user mark one of their own completed generations as saved, making it appear in history.

#### Scenario: Save succeeds for own generation
- **WHEN** a user calls save on a generation ID that belongs to them
- **THEN** the generation is flagged saved and subsequently appears in `GET /api/history`

#### Scenario: Save is rejected for another user's generation
- **WHEN** a user calls save on a generation ID that belongs to a different chat
- **THEN** the request is rejected and no row is modified

#### Scenario: Saving does not spend credits or affect the paywall
- **WHEN** a user saves a generation
- **THEN** no credit or subscription balance changes and no invoice is created

### Requirement: User can remove a playlist from history
The system SHALL let the authenticated user un-save a previously saved generation, removing it from history without deleting the underlying generation record.

#### Scenario: Unsave removes it from the history list
- **WHEN** a user un-saves a generation that was previously saved
- **THEN** it no longer appears in `GET /api/history`, and the generation itself can still be read via existing extend/resume flows

### Requirement: History lists only the user's saved playlists, newest first
`GET /api/history` SHALL return only generations belonging to the authenticated chat that are currently flagged saved, ordered by save/creation time descending, including prompt, playlist name, track count, and date.

#### Scenario: Only own saved playlists are returned
- **WHEN** a user with 2 saved and 3 unsaved generations fetches history
- **THEN** the response contains exactly those 2 saved generations and none of the unsaved ones or other users' generations

#### Scenario: Opening a saved history entry shows its tracks
- **WHEN** a user opens a saved history entry
- **THEN** the app shows the Results screen populated with that playlist's stored tracks
