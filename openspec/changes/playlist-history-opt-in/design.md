## Context

Every successful generation is already written to the `generations` table (`server/access/generations-store.ts`) purely so extend/resume can find prior tracks. There is no user-facing browsing of past playlists, and per the proposal, generating something must not automatically make it show up as "history" — the user decides which results are worth keeping. The Profile screen already has this exact opt-in-list pattern (a `Segmented` tab switcher with «Покупки» / «Загрузки», see `miniapp/src/screens/ProfileScreen.tsx`), so history should be a third tab there rather than a new top-level screen.

## Goals / Non-Goals

**Goals:**
- Saving a playlist to history is a deliberate, per-playlist user action, not a side effect of generation.
- History only ever shows what the user chose to keep; un-saving is non-destructive to the underlying generation row (extend/resume keeps working).
- Reuse existing patterns: `generations` table, `Segmented` tab component, existing auth/chatId middleware.

**Non-Goals:**
- No change to how/when generation rows are created or to credit/subscription accounting.
- No automatic pruning or TTL for saved history (out of scope; user manages it manually).
- No editing of a saved playlist's tracks from the history view (open → Results screen, same as a fresh result).

## Decisions

- **Add a `saved` column to the existing `generations` table** rather than a separate `saved_playlists` table. The row already has everything history needs (prompt, name, track count, tracks_json, created_at); a boolean flag is the minimal change and keeps a single source of truth per generation. Migration: `ALTER TABLE generations ADD COLUMN saved INTEGER NOT NULL DEFAULT 0` guarded the same way other additive migrations in `server/db.ts` are (check `pragma table_info`, run once).
- **Endpoints**: `POST /api/generations/:id/save` and `DELETE /api/generations/:id/save` (idempotent toggle-style, scoped by `chatId` from auth middleware — a generation not owned by the caller 404s). `GET /api/history` returns saved rows for the caller only, newest first (`ORDER BY created_at DESC`, no separate saved-at timestamp needed since re-saving doesn't need to bump order — kept simple).
- **Miniapp**: add a "Сохранить в историю" toggle button on `ResultsScreen` (calls save/unsave, reflects saved state fetched with the playlist or tracked locally after the action). Add a third `Segmented` option «История» in `ProfileScreen`, backed by `GET /api/history`, rendering name/prompt/track-count/date; tapping an entry navigates to `App.tsx`'s `results` screen using the stored tracks (no new fetch/generation needed, mirrors how `generationId` already flows into that screen).
- **No new capability for "unsaved generations"**: they keep existing behind-the-scenes lifecycle (used only for extend/resume), so no cleanup job is needed — this stays out of scope.

## Risks / Trade-offs

- [Risk] Users may expect saving to also preserve audio/downloads state → Mitigation: history only restores the track list/metadata into Results, matching what a fresh generation shows; download state is already tracked separately per the existing downloads feature and needs no change.
- [Risk] Migration on an existing large `generations` table → Mitigation: single additive column with a cheap default, same low-risk pattern as prior migrations in `server/db.ts`.

## Migration Plan

1. Add `saved` column via additive migration in `server/db.ts`.
2. Add store functions (`saveGeneration`, `unsaveGeneration`, `listSavedGenerations`) in `generations-store.ts`.
3. Add the three routes in `server/api/routes.ts`.
4. Add miniapp API client calls, Results screen save toggle, Profile «История» tab.
5. No rollback beyond redeploying the previous release — the added column is harmless if unused.
