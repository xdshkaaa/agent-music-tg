## Why

`POST /api/download` and `POST /api/downloads/:id/resend` reject with 409 "загрузка уже идёт — дождитесь завершения" whenever `hasActiveDownload` finds a row with status `pending`/`processing`. `processDownload` sets status to `processing` at the start and only flips it to a final status (`done`/`partial`/`failed`) at the very end of the function. If the process restarts or crashes anywhere between those two points — even after every track was already delivered to the user — the row is stuck at `processing` forever. The lock never clears, so the user is permanently blocked from starting a new download, even though nothing is actually running.

## What Changes

- Treat a `processing` (or `pending`) download as stale once it has been running longer than a bounded timeout, and no longer count it toward `hasActiveDownload`.
- On server startup, reconcile any rows left at `pending`/`processing` from a previous process (crash/restart) into a terminal status instead of leaving them stuck.
- Ensure `processDownload` finalizes status via a `finally`-style guard so an unexpected throw outside the per-track loop can't leave the row at `processing` indefinitely.

## Capabilities

### New Capabilities
- `audio-download-lock`: defines how the active-download lock is acquired, times out, and is reconciled across restarts so it can never wedge a chat out of downloading.

### Modified Capabilities
(none — no existing spec covers this behavior yet)

## Impact

- `server/audio/downloads-store.ts` — `hasActiveDownload` (staleness check), possible new `reconcileStaleDownloads` helper.
- `server/audio/deliver.ts` — `processDownload` (guarantee final status write).
- `server/index.ts` (or wherever server boot wires deps) — call reconciliation on startup.
- `server/api/audio-routes.ts` — no interface change, same 409 error, just no longer fires spuriously.
