## 1. Data model

- [x] 1.1 Add `updated_at` column to `downloads` table (migration, default backfilled from `created_at`)
- [x] 1.2 Touch `updated_at` in `setDownloadStatus` and `setDownloadTracks` (server/audio/downloads-store.ts)

## 2. Staleness-aware lock check

- [x] 2.1 Add a `DOWNLOAD_STALE_MS` constant (e.g. 15 min) near `MAX_TRACKS` in server/api/audio-routes.ts or downloads-store.ts
- [x] 2.2 Update `hasActiveDownload` to exclude rows whose `updated_at` is older than `DOWNLOAD_STALE_MS`
- [x] 2.3 Add/update tests in server/audio/audio.test.ts and server/api/audio-routes.test.ts covering: fresh `processing` row blocks, stale `processing` row does not block

## 3. Startup reconciliation

- [x] 3.1 Add `reconcileStaleDownloads(db)` in server/audio/downloads-store.ts: select all `pending`/`processing` rows, compute `finalStatusFor(tracks)` per row, write terminal status
- [x] 3.2 Call `reconcileStaleDownloads(db)` during server boot (server/index.ts) before the HTTP listener starts accepting requests
- [x] 3.3 Add test: seed a `processing` row with mixed track statuses, run reconciliation, assert correct terminal status (`done`/`partial`/`failed`)

## 4. Guard job finalization

- [x] 4.1 Wrap the tail of `processDownload` (server/audio/deliver.ts) in `try/finally` so `setDownloadStatus(..., finalStatusFor(tracks))` always runs even if the summary send throws
- [x] 4.2 Add test: mock `sender.sendText` to throw, assert download row still ends at the correct terminal status

## 5. Verification

- [x] 5.1 Run `bun test` (server/audio/audio.test.ts, server/api/audio-routes.test.ts) — 33 pass
- [x] 5.2 Run `bun run typecheck` — no new errors (pre-existing unrelated errors in admin-panel.ts, payments.test.ts)
- [ ] 5.3 Manually simulate a restart mid-download in dev (kill process while a job is `processing`) and confirm a fresh `POST /api/download` succeeds after restart
