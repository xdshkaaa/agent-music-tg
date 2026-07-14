## Why

/generate returns only text with deep links — users must tap each link to hear a track. The audio download pipeline (extractor, cache, delivery) already exists from the `download-audio-history-playback` change but is only reachable via the Mini App or a manual call. `/generate` should automatically deliver audio files directly to the chat so the user hears music immediately, not just sees links.

## What Changes

- After a successful generation, the bot automatically sends each track as an audio message (`sendAudio`) to the user's chat, reusing the existing `server/audio/` pipeline (extract → upload → cache `file_id`).
- The text playlist reply is kept as-is, with audio messages appended after it.
- Audio delivery is best-effort per-track (extraction failure skips that track, reports in a summary), not blocking the text reply.
- Users on a subscription or with remaining credits get audio automatically; free/guest access behaviour is unchanged.
- The existing `POST /api/download` endpoint, Mini App download button, and history are unaffected — they remain as parallel entry points.

## Capabilities

### New Capabilities
- `auto-audio-delivery`: automatic per-track audio delivery to chat after successful generation, with caching via `tg_file_id` and per-track failure tolerance.

### Modified Capabilities
- `generate-command`: add requirement that `/generate` (with or without arguments, on success) delivers each track as an audio message to the chat in addition to the existing text playlist reply.

## Impact

- **Server**: `server/bot/generate.ts` — after a successful generation (`outcome.status === "ok"`), wire the existing delivery pipeline (`processDownload` or direct `deliverTrack` calls) to send audio for each track.
- **Server**: `server/core/run-generation.ts` — `formatPlaylistReply` is unchanged; the audio-send logic lives in the bot handler, not the core runner.
- **Server**: `server/bot/index.ts` — the free-text fallback handler also needs the same audio delivery wiring.
- **No new dependencies** — everything (yt-dlp, ffmpeg, audio tables) is already deployed.
- **No Mini App changes** — purely a bot-side enhancement.
