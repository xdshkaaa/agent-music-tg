## ADDED Requirements

### Requirement: Animated avatar detection
The system SHALL detect whether a user's Telegram avatar file is animated (video/GIF) by inspecting the `file_path` extension returned from `getFile`. If the extension is `.mp4`, `.mov`, or `.gif`, the avatar SHALL be treated as animated.

#### Scenario: Detect MP4 avatar
- **WHEN** `getFile` returns `file_path` ending in `.mp4`
- **THEN** the system SHALL mark the avatar as animated

#### Scenario: Detect static avatar
- **WHEN** `getFile` returns `file_path` ending in `.jpg`, `.jpeg`, or `.png`
- **THEN** the system SHALL treat the avatar as static and use the original Telegram URL

### Requirement: Convert animated avatar to JPEG
The system SHALL convert animated avatars (MP4, GIF) to a static JPEG by extracting the first frame using ffmpeg. The output SHALL be saved to `data/avatars/<file_unique_id>.jpg`.

#### Scenario: Successful conversion
- **WHEN** an animated avatar is detected
- **AND** ffmpeg is available
- **THEN** the system SHALL extract the first frame and save as JPEG

#### Scenario: ffmpeg not available
- **WHEN** ffmpeg is not installed on the system
- **THEN** the system SHALL skip conversion and NOT crash

#### Scenario: Conversion failure
- **WHEN** ffmpeg exits with a non-zero code
- **THEN** the system SHALL return `photoUrl: null` instead of failing the request

### Requirement: Cache converted avatars
The system SHALL cache converted JPEG files on disk using `file_unique_id` as the key. On subsequent requests, the system SHALL check if the converted file exists before re-running conversion.

#### Scenario: Cache hit
- **WHEN** a converted JPEG exists at `data/avatars/<file_unique_id>.jpg`
- **THEN** the system SHALL return a URL pointing to the cached file

#### Scenario: Cache miss
- **WHEN** no converted JPEG exists for the given `file_unique_id`
- **AND** the avatar is animated
- **THEN** the system SHALL run conversion and save the result

### Requirement: Serve converted avatars
The system SHALL serve converted avatar JPEGs via an HTTP endpoint so the Mini App can load them as `<img src="...">`.

#### Scenario: Serve cached avatar
- **WHEN** the Mini App requests `GET /avatar/<file_unique_id>.jpg`
- **THEN** the server SHALL return the JPEG file with `Content-Type: image/jpeg`

#### Scenario: Avatar not found
- **WHEN** the requested avatar file does not exist
- **THEN** the server SHALL return 404

### Requirement: Graceful fallback in bot profile
The bot's `/profile` command SHALL fall back to sending text-only if `replyWithPhoto` fails (e.g., because the `file_id` points to a non-photo file).

#### Scenario: replyWithPhoto fails
- **WHEN** `replyWithPhoto` throws an error for an animated avatar
- **THEN** the bot SHALL send the profile text without a photo
