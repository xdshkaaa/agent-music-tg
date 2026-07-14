# Tasks: download-audio-history-playback

## 1. Infrastructure & schema

- [x] 1.1 Add `downloads` and `audio_cache` tables to `migrate()` in `server/db.ts`
- [x] 1.2 Add env/config for scratch dir, stream cache dir, cache size cap and TTL (`server/env.ts`, `.env.example`)
- [x] 1.3 Update `deploy/deploy.sh` to install/upgrade `yt-dlp` + `ffmpeg` on the VPS and create cache dirs (idempotent)

## 2. Audio extraction & cache (server/audio)

- [x] 2.1 Create `server/audio/extractor.ts`: map `ytm:`/`sc:` URIs to source URLs, run `yt-dlp -x --audio-format mp3` into a target dir, return file path + metadata; enforce URI pattern `^(ytm|sc):[\w-]+$`
- [x] 2.2 Create `server/audio/cache.ts`: `audio_cache` read/write helpers (get/set `file_id` by uri, refresh on invalidation)
- [x] 2.3 Unit tests for URI validation and cache helpers (in-memory sqlite, mocked extractor)

## 3. Download job & chat delivery

- [x] 3.1 Create `server/audio/downloads-store.ts`: insert/list/get/delete download rows, per-track status updates, owner checks
- [x] 3.2 Create `server/audio/deliver.ts`: process a job sequentially — cache hit → `sendAudio(file_id)`; miss → extract, upload, cache `file_id`, delete local file; per-track failure tolerance; stale `file_id` fallback; final summary message; enforce one active job per user and global extraction concurrency cap
- [x] 3.3 Add `POST /api/download` route: validate access + URIs, create record, respond `202`, kick off background job; reject concurrent jobs
- [x] 3.4 Tests: job lifecycle statuses (`done`/`partial`/`failed`), concurrent-job rejection, foreign-uri rejection (mock bot API + extractor)

## 4. History API

- [x] 4.1 Add `GET /api/downloads` (own records only, newest first)
- [x] 4.2 Add `POST /api/downloads/:id/resend` (owner check, reuse delivery pipeline)
- [x] 4.3 Add `DELETE /api/downloads/:id` (owner check; keeps `audio_cache` rows)
- [x] 4.4 Tests: user isolation, foreign id → 404, delete keeps cache

## 5. Streaming endpoint

- [x] 5.1 Create `server/audio/stream-cache.ts`: LRU disk cache (size cap + TTL, eviction on write)
- [x] 5.2 Add `GET /api/stream/:uri` route: auth via existing middleware, URI validation, extract-on-miss, serve with `audio/mpeg` + Range/206 support
- [x] 5.3 Tests: Range responses, invalid URI → 400, eviction under cap pressure

## 6. Mini App — download & history UI

- [x] 6.1 Add API client methods in `miniapp/src/lib/api.ts`: `download`, `downloads`, `resendDownload`, `deleteDownload`, stream URL builder (with initData auth)
- [x] 6.2 `ResultsScreen`: «Скачать» button next to «Новый плейлист» with idle/progress/done/error states
- [x] 6.3 `ProfileScreen`: `Segmented` switch «Покупки» | «Загрузки»; downloads list (name, date, track count, status) with empty state
- [x] 6.4 History entry actions: re-download (confirmation toast) and delete (confirm dialog, optimistic removal)

## 7. Mini App — inline player

- [x] 7.1 Create player store/context + `PlayerBar` component (track info, play/pause, progress) rendered in `App` above the dock; single shared `<audio>` element
- [x] 7.2 Wire play/pause controls into results track rows and downloads history tracks; loading state until playback starts; one-track-at-a-time; error state on stream failure
- [x] 7.3 Player styles consistent with glass UI (`glass.css`)

## 8. Verification & docs

- [x] 8.1 Run full test suite + typecheck (`bun test`, `tsc`) for server and miniapp
- [ ] 8.2 End-to-end check on VPS: generate → download to chat → play in miniapp → resend + delete from history
- [x] 8.3 Update README (yt-dlp/ffmpeg dependency, new endpoints, cache dirs)
