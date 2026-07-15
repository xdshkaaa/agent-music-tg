## ADDED Requirements

### Requirement: Active-download lock cannot wedge permanently
The system SHALL NOT treat a download row as active (blocking new downloads with the "загрузка уже идёт" error) once it has been in `pending` or `processing` status longer than a fixed staleness threshold.

#### Scenario: Stale processing row does not block a new download
- **WHEN** a chat has a download row stuck at `processing` for longer than the staleness threshold (e.g. because the server crashed mid-job)
- **THEN** `POST /api/download` for that chat succeeds (202) instead of returning 409

#### Scenario: Genuinely active job still blocks concurrent downloads
- **WHEN** a chat has a download row at `processing` that was updated within the staleness threshold
- **THEN** `POST /api/download` and `POST /api/downloads/:id/resend` for that chat return 409 with "загрузка уже идёт — дождитесь завершения"

### Requirement: Startup reconciliation of interrupted downloads
On server startup, the system SHALL finalize every download row left at `pending` or `processing` status from a previous process, using each row's per-track statuses to compute the correct terminal status.

#### Scenario: Row with all tracks sent is reconciled to done
- **WHEN** the server restarts and finds a `processing` row whose tracks are all `status: "sent"`
- **THEN** the row is updated to `status: "done"` during startup, before the server accepts requests

#### Scenario: Row with no tracks sent is reconciled to failed
- **WHEN** the server restarts and finds a `pending` or `processing` row whose tracks are all still `status: "pending"` or `status: "failed"`
- **THEN** the row is updated to `status: "failed"` during startup

#### Scenario: Row with some tracks sent is reconciled to partial
- **WHEN** the server restarts and finds a `processing` row with a mix of `sent` and non-`sent` tracks
- **THEN** the row is updated to `status: "partial"` during startup

### Requirement: Job finalization survives unexpected errors
`processDownload` SHALL always write a terminal status for the download row, even if an error occurs after the per-track delivery loop completes.

#### Scenario: Error during summary send still finalizes status
- **WHEN** `processDownload` finishes delivering all tracks but throws while sending the summary text message (e.g. user blocked the bot)
- **THEN** the download row still ends up at the terminal status computed from `finalStatusFor(tracks)`, not stuck at `processing`
