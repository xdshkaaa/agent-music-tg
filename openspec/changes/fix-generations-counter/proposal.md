# Proposal: Fix generation counter

## Why

The generation history counter («история генераций») silently undercounts. When the
AI agent asks a clarifying question, the playlist is produced through the
clarification/resume flow — but `resumeGeneration` logs the final playlist and consumes
a credit **without** ever writing to the `generations` table. Since clarification is a
common path, the recorded count stays stuck near zero and the counter looks broken.

## What Changes

- **Record every successful generation**, including ones finished via the clarification/resume
  flow, into the `generations` table. This is the root-cause fix and makes the existing
  `/history` command and any generation log accurate.
- **Expose a reliable "spent generations" total** to the user, derived from the
  generations log (not inferred from the remaining credit balance), in the Mini App
  Profile screen and the `/credits` command. Previously there was no user-visible
  "how many generations have I used" number at all.
- Add a lightweight `generations` count helper on the access layer and surface it via
  the authenticated `/me` endpoint.

No breaking API changes: the new fields are additive on `/me`, and the `generations`
table already exists.

## Capabilities

### New Capabilities
- `generation-history`: Every completed generation (first-try or via clarification) MUST
  be recorded in the generations log, and a total generations count MUST be queryable and
  shown to the user. Covers the `insertGeneration` gap in `resumeGeneration` and the
  user-facing spent-count display.

### Modified Capabilities
<!-- none: this is a recording/visibility fix, no existing requirement behavior changes -->

## Impact

- `server/core/run-generation.ts` — `resumeGeneration` now calls `insertGeneration` on the
  `ok` outcome.
- `server/access/generations-store.ts` — new `countGenerations(db, chatId)` helper.
- `server/api/routes.ts` — `/me` returns `generationsUsed`; `/credits` shows the spent total.
- `miniapp/src/lib/api.ts` — `MeResponse` gains `generationsUsed`.
- `miniapp/src/screens/ProfileScreen.tsx` — show «Потрачено: N ген» in the account block.
- Existing `/history` bot command now reflects resumed generations automatically.
- Database: no schema change (`generations` table already exists).
