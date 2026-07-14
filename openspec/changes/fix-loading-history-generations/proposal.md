## Why

When a user initiates a download from ResultsScreen, the new download record doesn't appear in Profile → «Загрузки» without manually switching tabs away and back. Status updates (pending → done) also aren't reflected in real time because there's no polling or auto-refresh mechanism.

## What Changes

- Add a shared refresh signal so ProfileScreen re-fetches downloads after a new download is created from ResultsScreen
- Add lightweight polling to DownloadsSection that updates download statuses while any are pending/processing
- Show real-time status transitions (pending → processing → done) without user action

## Capabilities

### New Capabilities

- `download-history-live-refresh`: Real-time updates for the download history list — new entries appear automatically, status updates reflect without manual refresh

### Modified Capabilities

- *(none — no spec-level requirement changes)*

## Impact

- `miniapp/src/screens/ProfileScreen.tsx` — DownloadsSection polling logic and auto-refresh
- `miniapp/src/screens/ResultsScreen.tsx` — Signal ProfileScreen after successful download
- `server/api/audio-routes.ts` — Minimal (no backend changes expected unless polling endpoint is needed)
