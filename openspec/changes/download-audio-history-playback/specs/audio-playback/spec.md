# audio-playback

## ADDED Requirements

### Requirement: Authenticated audio streaming endpoint
The server SHALL expose `GET /api/stream/:uri` serving audio for a track URI matching `^(ytm|sc):[\w-]+$` to authenticated Mini App users, with `Content-Type: audio/mpeg` and HTTP Range support so seeking works in `<audio>` elements.

#### Scenario: First play extracts and streams
- **WHEN** an authorized user requests a URI with no local stream-cache file
- **THEN** the server extracts the audio via yt-dlp into the stream cache and serves the file

#### Scenario: Cached play is served directly
- **WHEN** the requested URI has a fresh file in the stream cache
- **THEN** the server serves it immediately without re-extraction

#### Scenario: Range request honored
- **WHEN** the client sends a `Range` header for a cached file
- **THEN** the server responds `206 Partial Content` with the requested byte range

#### Scenario: Invalid URI or unauthenticated request rejected
- **WHEN** the URI does not match the allowed pattern or the request lacks valid initData
- **THEN** the server responds with `400` or `401` respectively and performs no extraction

### Requirement: Stream cache eviction
The server SHALL bound the stream cache by size and age (LRU with a configurable cap and TTL), deleting evicted files so the cache never grows unbounded on the VPS.

#### Scenario: Cache over cap is trimmed
- **WHEN** adding a new file pushes the cache past its size cap
- **THEN** least-recently-used files are deleted until the cache is within the cap

### Requirement: Inline player in Mini App
The Mini App SHALL provide a single shared audio player. Track rows on the results screen and downloads history detail SHALL have a play/pause control, and a player bar with track info, play/pause, and progress SHALL appear above the dock while a track is loaded. Only one track SHALL play at a time.

#### Scenario: User plays a track from results
- **WHEN** the user taps play on a track row
- **THEN** the player bar appears, the track streams from `/api/stream/:uri`, and the row's control shows a loading state until playback starts

#### Scenario: Playing a second track stops the first
- **WHEN** a track is playing and the user taps play on a different track
- **THEN** the first track stops and the second one plays in the shared player

#### Scenario: Pause and resume
- **WHEN** the user taps pause in the player bar or on the active row
- **THEN** playback pauses and can be resumed from the same position

#### Scenario: Playback failure surfaced
- **WHEN** the stream request fails for a track
- **THEN** the player shows an error state for that track and the app remains usable
