## ADDED Requirements

### Requirement: Auto-audio delivery on generation success

When a generation completes successfully, the bot SHALL deliver each track as an audio message (`sendAudio`) to the user's chat in addition to the text playlist reply.

The bot SHALL reuse the existing audio extraction and caching pipeline: check `audio_cache` by track URI first, and only extract via yt-dlp on cache miss.

The bot SHALL send audio messages sequentially (one per track) after the text reply has been sent, so the user sees results immediately.

#### Scenario: All tracks delivered successfully

- **WHEN** generation succeeds with 3 tracks
- **THEN** bot sends text playlist reply
- **THEN** bot sends 3 audio messages (one per track) with correct title and artist metadata
- **THEN** bot sends a summary "✅ все 3 треков отправлены"

#### Scenario: Some tracks fail extraction

- **WHEN** generation succeeds but track 2 fails extraction (region-locked)
- **THEN** bot sends text playlist reply
- **THEN** bot sends audio for tracks 1 and 3
- **THEN** bot does not send audio for track 2
- **THEN** bot sends a summary "⚠️ отправлено 2 из 3. Не получилось: • Artist — Title"

#### Scenario: All tracks fail

- **WHEN** generation succeeds but all tracks fail extraction
- **THEN** bot sends text playlist reply
- **THEN** bot sends an error summary "❌ не удалось скачать треки"

### Requirement: Cache-first delivery

The bot SHALL check the `audio_cache` table by track URI before extracting. On cache hit, it SHALL send the cached `tg_file_id` directly without invoking yt-dlp.

#### Scenario: Re-generation reuses cached audio

- **WHEN** user generates same track twice (same URI)
- **THEN** second delivery uses `sendAudio(file_id)` without extracting
- **THEN** second delivery is instant

### Requirement: No credit cost for audio

Auto-audio delivery SHALL NOT consume additional credits beyond the generation itself.

#### Scenario: Generation credits unaffected

- **WHEN** user has 1 credit and generates a playlist
- **THEN** 1 credit is consumed for generation
- **THEN** 0 additional credits are consumed for audio delivery
