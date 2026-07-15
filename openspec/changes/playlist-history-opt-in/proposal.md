## Why

Every generated playlist already lands in the `generations` table (needed internally for extend/resume), but there is no user-facing way to browse past results, and nothing distinguishes a playlist the user cares about from a throwaway one. Users want a history of playlists they've generated, but saving should be a deliberate choice per playlist, not an automatic side effect of every request — most generations are experiments and shouldn't clutter a "my playlists" list.

## What Changes

- Add a `saved` flag to generation rows; generations remain recorded for extend/resume as today, but are **not** surfaced in history unless explicitly saved.
- Add a "Сохранить в историю" action on the Results screen so the user can opt in to keeping a specific playlist.
- Add a way to un-save (remove from history) a previously saved playlist.
- Add a History tab/screen in the Mini App listing only saved playlists (name, prompt, track count, date), opening a saved playlist re-enters the Results screen with its tracks.
- Add `GET /api/history`, `POST /api/generations/:id/save`, `DELETE /api/generations/:id/save` endpoints.

## Capabilities

### New Capabilities
- `playlist-history`: opt-in saving of generated playlists and a history view listing only saved playlists.

### Modified Capabilities
- `generation-access`: generation rows gain a `saved` state; saving/un-saving does not consume credits or affect the paywall.

## Impact

- `server/db.ts`: migration adding `saved` column to `generations`.
- `server/access/generations-store.ts`: save/unsave/list-saved queries.
- `server/api/routes.ts`: new history + save/unsave endpoints.
- `miniapp/src/lib/api.ts`, `miniapp/src/screens/ResultsScreen.tsx`, `miniapp/src/App.tsx`: save button, new History screen/route.
