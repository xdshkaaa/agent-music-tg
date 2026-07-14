# Proposal: download-audio-history-playback

## Why

Playlist results are currently link-only (deep links to YouTube Music / SoundCloud). Users want the actual audio: download a generated playlist as audio files delivered into their Telegram chat, listen to tracks directly inside the Mini App, and manage past downloads (re-download / delete) from a history screen in the profile area.

## What Changes

- **«Скачать» button on the results screen** next to «Новый плейлист». Tapping it queues a server-side download of the playlist's tracks and delivers them as Telegram audio messages to the user's chat with the bot.
- **Server-side audio extraction pipeline**: resolve a track `uri` (`ytm:<videoId>` / `sc:<id>`) to an audio file via `yt-dlp` on the VPS, cache the resulting Telegram `file_id` so repeat sends are instant and free.
- **Audio delivery to chat**: bot sends each track as a `sendAudio` message (title/performer/artwork metadata), with progress feedback and per-track failure tolerance.
- **Downloads history**: new `downloads` table records every downloaded playlist/track per user.
- **«Загрузки» tab in Mini App profile area**: history list showing downloaded playlists with tracks; each entry supports re-download (re-send to chat) and delete (remove from history).
- **In-app audio playback**: Mini App can play tracks inline through a streaming endpoint backed by the same extraction/cache layer; a mini-player with play/pause and progress appears on results and downloads screens.

## Capabilities

### New Capabilities

- `audio-download`: server-side resolution of track URIs to audio files, Telegram `file_id` caching, delivery of audio messages to chat, and the results-screen download entry point.
- `download-history`: persistent per-user record of downloads; list, re-download, and delete operations exposed via API and the profile «Загрузки» UI.
- `audio-playback`: authenticated audio streaming endpoint and Mini App inline player (play/pause/progress) on results and downloads screens.

### Modified Capabilities

<!-- none: existing specs unaffected at requirement level -->

## Impact

- **Server**: new `server/audio/` module (yt-dlp wrapper, file cache, telegram delivery); new API routes (`POST /api/download`, `GET /api/downloads`, `DELETE /api/downloads/:id`, `POST /api/downloads/:id/resend`, `GET /api/stream/:uri`); `db.ts` migration adding `downloads` + `audio_cache` tables; bot gains audio-send helper.
- **Mini App**: `ResultsScreen` (download button + player), `ProfileScreen` (new «Загрузки» section/tab), new `DownloadsScreen`/`Player` components, `lib/api.ts` client methods.
- **Deps/ops**: requires `yt-dlp` (+ `ffmpeg`) installed on the VPS; disk space for temporary audio files; Bot API 50 MB upload limit constrains track size.
- **No breaking changes** to existing generation flow, payments, or access control.
