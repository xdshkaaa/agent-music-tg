## Context

The `generations` table (created in `server/db.ts`) is the single source of truth for a
user's generation history. It is written only from `startGeneration`
(`server/core/run-generation.ts:72`) via `insertGeneration`. The clarification flow splits
a generation across two calls: `startGeneration` returns `status: "clarify"` (no credit
spent, no record), then `resumeGeneration` is called with the answer. `resumeGeneration`
spends the credit and runs `fireVerification`, but **never calls `insertGeneration`**
(`server/core/run-generation.ts:90-93`). Because the agent frequently asks clarifying
questions, the bulk of real generations are invisible to the log, so «история генераций»
looks broken.

The remaining credit balance (`user.credits`) is unaffected — `consumeAccess` is called in
both paths — so the bug is purely about the *recorded/spent* count, not the wallet.

## Goals / Non-Goals

**Goals:**
- Make `resumeGeneration` record the generation identically to `startGeneration`.
- Provide a queryable total (`countGenerations`) and surface it to the user as a
  "spent generations" number in `/me`, the Mini App Profile, and `/credits`.
- Keep `/history` correct automatically once the log is complete.

**Non-Goals:**
- No change to credit/debit logic or paywall behavior.
- No new database tables or migrations (`generations` already exists).
- No admin-side analytics changes (out of scope for this counter fix).

## Decisions

### D1: Mirror the `startGeneration` recording block in `resumeGeneration`
In `resumeGeneration`, on `outcome.status === "ok"`, call
`insertGeneration(db, chatId, originalPrompt, outcome.playlist.name, outcome.playlist.tracks.length)`.
`resumeGeneration` already has `originalPrompt` and the full `outcome.playlist`, so the
call is identical in shape to `startGeneration`. This is the minimal, behavior-preserving
fix — no new abstraction needed.

**Alternative considered:** a shared `recordGeneration()` helper used by both functions.
Rejected for now to keep the change small and reviewable; can be extracted later if more
call sites appear.

### D2: Add `countGenerations(db, chatId)` to `generations-store.ts`
A thin `SELECT COUNT(*) FROM generations WHERE chat_id = ?` returning a number, mirroring
the existing `listGenerations` style. Reused by `/me` and `/credits`.

### D3: Additive `generationsUsed` field on `/me`
Extend the `/me` response (`server/api/routes.ts:138`) with `generationsUsed:
countGenerations(db, chatId)`. Additive field, ignored by older clients.

### D4: Display in Mini App Profile and `/credits`
- `MeResponse` gains `generationsUsed: number` (`miniapp/src/lib/api.ts`).
- `ProfileScreen` account block shows «Потрачено: N ген» beneath the balance.
- `/credits` appends the spent total next to «Генерации: N» (remaining).

## Risks / Trade-offs

- [Risk] Backfilled count only covers future generations; historical resumed generations
  before deploy remain unrecorded. → Acceptable: the counter becomes correct going
  forward; a one-off backfill script is not warranted for a personal/allowlist bot.
- [Risk] `countGenerations` adds a query per `/me` and `/credits` call. → Negligible at
  allowlist scale; the `generations` table is small and indexed by `chat_id`.
- [Risk] Russian copy wording. → Keep consistent with existing strings ("ген",
  "Потрачено").

## Migration Plan

No schema migration. Deploy is additive: new endpoint field + UI text. Rollback = revert
the changed files; the `generations` table is unchanged and safe.

## Open Questions

- Should the Profile screen also show a "total generations" headline instead of only the
  spent count? (Decided: show spent count only, keep scope tight.)
