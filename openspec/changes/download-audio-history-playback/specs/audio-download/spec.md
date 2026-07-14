# audio-download

## ADDED Requirements

### Requirement: Download button on results screen
The Mini App results screen SHALL display a «Скачать» button next to the «Новый плейлист» button. Tapping it SHALL start a download of the displayed playlist and show delivery feedback without leaving the screen.

#### Scenario: User starts a download
- **WHEN** the user taps «Скачать» on the results screen
- **THEN** the app calls `POST /api/download` with the playlist name and tracks, and the button shows an in-progress state («Отправляю в чат…») followed by a confirmation («Отправлено в чат ✓») once the request is accepted

#### Scenario: Download request fails
- **WHEN** `POST /api/download` returns an error (no access, another job running)
- **THEN** the app shows the error message and the button returns to its idle state

### Requirement: Server-side download job
The server SHALL accept a playlist download request from an authorized user, respond immediately with an accepted job, and process tracks asynchronously. Only track URIs matching `^(ytm|sc):[\w-]+$` SHALL be accepted.

#### Scenario: Job accepted
- **WHEN** an authorized user posts a playlist with valid track URIs
- **THEN** the server creates a `downloads` record with status `pending`, responds `202` with the download id, and begins processing in the background

#### Scenario: Invalid track URI rejected
- **WHEN** the request contains a track URI not matching the allowed pattern
- **THEN** the server responds `400` and creates no download record

#### Scenario: Concurrent job rejected
- **WHEN** the user already has a download job in status `pending` or `processing`
- **THEN** the server responds with an error indicating a download is already in progress

### Requirement: Audio delivery to Telegram chat
For each track in a download job, the server SHALL obtain an audio file (from the `file_id` cache or by extracting via yt-dlp) and send it to the user's bot chat as an audio message with title, performer, and artwork metadata. After all tracks are processed the bot SHALL send a summary message.

#### Scenario: Cached track delivered instantly
- **WHEN** a track's URI has a cached Telegram `file_id`
- **THEN** the bot sends the audio via `file_id` without extracting or uploading the file again

#### Scenario: Uncached track extracted and delivered
- **WHEN** a track's URI has no cached `file_id`
- **THEN** the server extracts audio via yt-dlp, uploads it via `sendAudio`, stores the returned `file_id` in `audio_cache`, and deletes the local file

#### Scenario: Per-track failure does not abort the job
- **WHEN** extraction or sending fails for one track (extraction error, file over 50 MB)
- **THEN** that track is marked `failed`, remaining tracks continue processing, and the final summary lists the failed tracks

#### Scenario: Stale file_id refreshed
- **WHEN** `sendAudio` with a cached `file_id` fails
- **THEN** the server re-extracts the track, uploads it fresh, and updates the cache row

### Requirement: Job completion status
The server SHALL finalize each download record as `done` (all tracks sent), `partial` (some failed), or `failed` (none sent), with per-track statuses persisted.

#### Scenario: Mixed outcome recorded
- **WHEN** a 10-track job finishes with 8 sent and 2 failed
- **THEN** the download record has status `partial` and each track's individual status is stored
