## Context

`hasActiveDownload` (server/audio/downloads-store.ts) gates `POST /api/download` and `POST /api/downloads/:id/resend` on whether any row for the chat has status `pending` or `processing`. `processDownload` (server/audio/deliver.ts) is fired-and-forgotten from `startJob`; it sets status to `processing` immediately, runs the per-track loop (each track's outcome is caught individually), then writes the final status (`done`/`partial`/`failed`) and sends a summary message. There is no timeout, heartbeat, or startup reconciliation — if the Bun process restarts (deploy, crash, OOM) while a row is at `processing`, that row stays there forever, since nothing ever revisits it. The chat is then permanently stuck seeing "загрузка уже идёт — дождитесь завершения" on every future attempt, regardless of whether tracks actually finished delivering.

## Goals / Non-Goals

**Goals:**
- A `pending`/`processing` row can never block downloads indefinitely.
- Recover automatically from a mid-job server restart without manual DB surgery.
- Keep the existing 409 contract (same error message/shape) for genuinely-active jobs.

**Non-Goals:**
- Resuming a half-finished job's remaining tracks after restart (out of scope — reconciliation only marks the row terminal, it doesn't re-queue delivery). A user can just retry via resend once unblocked.
- Distributed/multi-instance locking (single Bun process/VPS deployment, per README).

## Decisions

1. **Staleness timeout in `hasActiveDownload`.** Add a `startedAt`/`updatedAt` concept (reuse `created_at`, or add `updated_at` touched on every `setDownloadStatus`/`setDownloadTracks` write) and treat a `pending`/`processing` row older than a fixed threshold (e.g. 15 minutes — comfortably longer than a full 50-track playlist at the 2-slot extraction concurrency cap) as not active. Chosen over a hard TTL-only column because reusing existing timestamp columns needs no new migration semantics beyond one `updated_at` column.
   - Alternative considered: Redis/in-memory lock instead of DB row status. Rejected — adds an external dependency for a single-process app; DB is already the source of truth and survives restarts, which is exactly the property needed.
2. **Startup reconciliation.** On boot, before the server starts accepting traffic, sweep all rows still at `pending`/`processing` and set them to `failed` (their tracks' per-track status already reflects what was actually sent, so `finalStatusFor` is used per row instead of blindly setting `failed`, giving accurate `partial`/`done`/`failed`). This guarantees no row survives a restart in a non-terminal state, making the timeout in decision 1 a belt-and-suspenders backstop rather than the primary fix.
3. **Guard the tail of `processDownload`.** Wrap the finalization (`setDownloadStatus(..., finalStatusFor(tracks))` and the summary send) so that even if something throws between the loop and the final write, the row still gets finalized (`failed` with whatever per-track state was last persisted) via a `try/finally`. This closes the narrow window between "loop ends" and "final status written" without waiting for the next restart's reconciliation pass.

## Risks / Trade-offs

- [Timeout too short flags a legitimately slow large playlist as stale, letting a second job start concurrently] → Set threshold generously (15 min) relative to observed worst-case (50 tracks × ~15s extraction / 2 concurrent slots ≈ 6–7 min); document the constant next to `MAX_TRACKS` so both are tuned together.
- [Startup reconciliation runs on every restart, including routine deploys, and could race a job that's genuinely mid-flight if reconciliation ran after `processDownload` resumed — but processes don't resume in-flight work after a crash, so there's nothing to race] → No mitigation needed; a restarted process has no in-memory job state, so any `processing` row found at boot is unconditionally stale.
- [Reconciled rows marked `failed`/`partial` even when tracks fully sent but the final status write just didn't land yet] → `finalStatusFor(tracks)` is computed from actual per-track `sent` status (persisted after every track), so this reports `done` correctly in that case, not a spurious `failed`.

## Migration Plan

- Add `updated_at` column to `downloads` table (default to `created_at`), touched by `setDownloadStatus`/`setDownloadTracks`.
- Add reconciliation call at server startup, before listening.
- No rollback concerns beyond reverting the code — reconciliation only mutates rows that were already stuck/unusable.
