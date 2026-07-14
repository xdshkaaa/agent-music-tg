## Context

- The audio pipeline (`server/audio/` — `YtDlpExtractor`, `TelegramAudioSender`, `deliverTrack`, `audio_cache`, `stream-cache`) is fully implemented from the `download-audio-history-playback` change.
- `/generate` currently sends only a text Markdown reply with track names and deep links.
- The track `uri` (e.g. `ytm:<videoId>`) is available on every `Track` in the finalized playlist.
- The bot runs on a VPS with `yt-dlp` + `ffmpeg` installed; `audio_cache` table and scratch dirs exist.
- Audio delivery must be best-effort (per-track failure tolerance) and non-blocking for the text reply.

## Goals / Non-Goals

**Goals:**
- After successful generation, each track is sent as an audio message (`sendAudio`) to the user's chat automatically.
- Audio delivery uses the existing cache — repeat generations of same tracks cost no extra extraction.
- Per-track failures (extraction error, >50 MB) skip that track and are reported in a summary message; overall generation is not rolled back.
- Works for both `/generate <text>` and free-text generation triggers.
- Text playlist reply appears immediately; audio follows as tracks are extracted and uploaded.

**Non-Goals:**
- No separate "download" history row is created for auto-delivered audio (the generation is already recorded in the `generations` table).
- No Mini App changes — purely bot-side enhancement.
- No new payment/credit gating — generation access control already covers audio delivery.
- No UI changes to the text reply format.
- No queuing or batching beyond sequential per-track delivery.

## Decisions

### D1: Reuse `deliverTrack` directly, skip `DownloadRecord`

The existing `deliverTrack(db, chatId, track, deps)` function in `server/audio/deliver.ts` does exactly what we need: cache-hit → `sendAudio(file_id)`, miss → extract → upload → cache. It operates on a `DownloadTrack` which is structurally compatible with `Track` (same `uri`/`title`/`artist`/`durationMs` fields). Using `processDownload` (which requires creating a `DownloadRecord` in the `downloads` table) would add unnecessary persistence and history noise for auto-delivery. Instead, a thin loop over `deliverTrack` does the job.

Consequence: `auto-audio` does not appear in the user's download history in the Mini App — this is intentional. If users want a persistent record they use the existing "Скачать" button.

### D2: Text reply first, audio follows

The bot first sends the text playlist reply (instant), then iterates tracks and delivers audio one by one. This keeps latency low for the visible response. Audio messages appear as separate messages below the text, preserving the existing UX.

### D3: New helper `server/bot/auto-audio.ts`

A small module that:
- Exports `deliverAutoAudio(db, chatId, tracks, api)` — constructs `AudioSender` + `Extractor` + `scratchDir` from config, loops `deliverTrack`, sends summary.
- Also handles the free-text trigger path in `server/bot/index.ts`.

Keeps `generate.ts` from growing delivery wiring.

### D4: Shared `TelegramAudioSender` from `bot.api`

`TelegramAudioSender` is created from `bot.api` (grammY's `Api` instance). The sender is constructed once inside the handler, not globally, to avoid lifecycle issues.

### D5: Extraction concurrency respects the global semaphore

`deliverTrack` internally calls `withExtractionSlot` (the global semaphore in `deliver.ts`). Auto-audio delivery naturally respects the same extraction concurrency cap (`maxConcurrentExtractions: 2`) as the download pipeline.

### D6: Per-track failure tolerant, summary at the end

Same pattern as `processDownload`: catch per-track errors, continue, send a final message summarising sent/skipped counts. The text reply is already sent, so the summary is purely informational.

### D7: No credit cost for audio delivery

Generation already consumed a credit (or was free for subscribers/admins). Audio delivery is considered part of the generation, not an additional cost.

## Risks / Trade-offs

- [Sequential extraction for long playlists (10+ tracks) is slow] → Each track takes 5–30 s to extract; user sees audio messages arriving one by one. The text reply appears immediately so the chat doesn't feel stalled. Future optimisation: parallel extraction within a single generation (but adds complexity and VPS CPU pressure).
- [User closes chat mid-delivery] → Extraction continues but `sendAudio` to an inactive chat succeeds (Telegram delivers when the user reopens). If the user blocked the bot, the send throws but is caught by per-track error handling.
- [Audio delivery fails for some backends (SoundCloud via yt-dlp)] → Same limitation as the download pipeline; `deliverTrack` already handles this by catching the extraction error and skipping the track.
- [Duplicate file_id handling] → The existing `audio_cache` table handles dedup; same mechanism applies here.

## Migration Plan

1. Add `server/bot/auto-audio.ts` with `deliverAutoAudio` helper.
2. Wire into `server/bot/generate.ts` after successful generation.
3. Wire into the free-text handler in `server/bot/index.ts` after successful generation.
4. Deploy: no schema changes, no new dependencies — just a code push.

## Open Questions

- Should auto-audio delivery be opt-in (a setting) or always-on? Current answer: always-on since the user explicitly asked for audio on /generate.
- Should text-only mode exist for users who prefer links? Future consideration.
