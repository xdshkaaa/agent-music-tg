## 1. Cross-screen refresh signal

- [x] 1.1 Dispatch `download-created` custom event on `window` after successful download in ResultsScreen (`handleDownload` after `api.download` resolves)
- [x] 1.2 Listen for `download-created` event in `ProfileScreen` (or `DownloadsSection`) and increment `downloadsRefresh` counter

## 2. Download status polling

- [x] 2.1 Add `useEffect` in `DownloadsSection` that starts a 5s polling interval when any download has `pending` or `processing` status
- [x] 2.2 Clear the interval when all downloads reach terminal statuses (`done`, `partial`, `failed`) or component unmounts
- [x] 2.3 Ensure only one in-flight request at a time (await poll response before scheduling next tick)

## 3. Verification

- [x] 3.1 Run `bun run typecheck` — no new errors (pre-existing errors in unrelated files)
- [x] 3.2 Run `bun test` — existing tests pass (108 pass, 3 pre-existing failures in unrelated test)
