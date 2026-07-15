## 1. Data layer

- [x] 1.1 Add additive migration in `server/db.ts`: `saved INTEGER NOT NULL DEFAULT 0` on `generations` (guard with `pragma table_info` check like other migrations in this file).
- [x] 1.2 In `server/access/generations-store.ts`: extend `GenerationRow`/`GenerationRowRaw`/`toGeneration` with `saved`, add `saveGeneration(db, chatId, id)`, `unsaveGeneration(db, chatId, id)` (both scoped to `chatId`, no-op/404-able if not owned), and `listSavedGenerations(db, chatId)` ordered by `created_at DESC`.

## 2. API routes

- [x] 2.1 Add `POST /api/generations/:id/save` in `server/api/routes.ts` — 404 if the generation doesn't belong to the caller's `chatId`, otherwise sets `saved = 1`.
- [x] 2.2 Add `DELETE /api/generations/:id/save` — same ownership check, sets `saved = 0`.
- [x] 2.3 Add `GET /api/history` — returns `listSavedGenerations` for the caller's `chatId` (prompt, playlist name, track count, tracks, created_at, id).

## 3. Miniapp API client

- [x] 3.1 In `miniapp/src/lib/api.ts`: add `saveGeneration(id)`, `unsaveGeneration(id)`, `fetchHistory()` wrapping the new endpoints.

## 4. Miniapp UI

- [x] 4.1 In `ResultsScreen.tsx`: add a "Сохранить в историю" toggle button reflecting current saved state, calling save/unsave on click.
- [x] 4.2 In `ProfileScreen.tsx`: add «История» as a third `Segmented` option alongside «Покупки» / «Загрузки»; fetch and render saved playlists (name, prompt, track count, date) with a refresh-on-tab-select like the existing «Загрузки» tab.
- [x] 4.3 In `App.tsx`: wire tapping a history entry to open the `results` screen using that entry's stored tracks/generationId (no re-generation).

## 5. Verification

- [x] 5.1 Add/extend tests in `server/access/generations-store.test.ts` for save/unsave/list-saved scoped by chatId.
- [ ] 5.2 Manually verify: generate a playlist → it does not appear in history; save it → appears; unsave it → disappears; extend/resume still works on an unsaved generation.
