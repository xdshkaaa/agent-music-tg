## Context

The download history tab (ProfileScreen → «Загрузки») fetches downloads only on mount and when switching tabs with a `refreshKey` counter. ResultsScreen also creates downloads but has no way to notify ProfileScreen to refresh. Once on the tab, no mechanism updates statuses as background jobs complete.

Three sub-problems:
- **No cross-screen signal**: ResultsScreen calls `api.download()` successfully, but ProfileScreen never re-fetches
- **No polling**: `DownloadsSection` fetches once per `refreshKey` change; status stays stale until manual refresh
- **No fine-grained status tracking**: The UI shows the record but its status may be `pending` for minutes while `processDownload` runs

## Goals / Non-Goals

**Goals:**
- New downloads created from ResultsScreen appear in «Загрузки» without tab-switching
- Download statuses update in real time while any entries are pending/processing
- Minimal backend changes (polling uses existing `GET /api/downloads`)

**Non-Goals:**
- No WebSocket or SSE (overengineered for this use case)
- No backend push or webhook (fire-and-forget stays fire-and-forget)
- No changes to the playback/streaming functionality
- No pagination (handled separately if needed)

## Decisions

**D1 — Polling over push**
The backend is fire-and-forget with no delivery callback to the Mini App. Adding polling is the simplest reliable approach: `GET /api/downloads` already returns every record with status. Poll every 5s while any download is pending/processing, stop when all are terminal.

- Alternative considered: WebSocket/SSE — adds connection lifecycle, reconnection logic, server complexity. Not justified for occasional status transitions.
- Alternative considered: Event bus / shared state — would require a state management library (Zustand, Jotai) or React Context. Viable for the cross-screen signal but overkill for polling alone.

**D2 — Custom event for cross-screen signal**
After a successful download on ResultsScreen, dispatch a custom DOM event (`download-created`). ProfileScreen listens for it and increments `downloadsRefresh`. This avoids adding a state management library or prop-drilling through screen navigation.

- Alternative considered: React Context with a shared downloads context — more idiomatic in React but requires wrapping the app, adding boilerplate, and the event is simpler for a one-off signal.
- Alternative considered: `window.__refreshDownloads` global — works but fragile and hard to test.

**D3 — Polling only when active**
`DownloadsSection` starts a 5s interval only when `downloads.some(d => d.status === 'pending' || d.status === 'processing')`. The interval clears when all reach terminal states. This avoids unnecessary network traffic when the user has no active downloads.

- Alternative considered: Always poll — simpler code but wastes requests. Users typically view history briefly.
- Alternative considered: Push-based (WebSocket/SSE) — overengineered, see D1.

## Risks / Trade-offs

- [Polling latency] → Status updates are at most 5s delayed. Acceptable for a background job that takes minutes.
- [Custom event coupling] → If ResultsScreen unmounts before ProfileScreen mounts, the event is lost. Mitigation: ProfileScreen also fetches on mount, so the download record already exists — polling picks up the status.
- [Network overhead] → 5s polling while on tab. Mitigation: stops polling when all downloads are terminal; only one in-flight request at a time (await before next tick).
