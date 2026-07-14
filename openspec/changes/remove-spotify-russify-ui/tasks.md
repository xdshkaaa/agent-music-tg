## 1. Remove Spotify from the backend type layer

- [x] 1.1 Remove `"spotify"` from the `MusicBackend` union in `server/music/types.ts`; update the URI doc comment to drop the `spotify:track:x` example.
- [x] 1.2 In `server/music/registry.ts`: remove the `SpotifyClient` import, drop `"spotify"` from `AVAILABLE_BACKENDS`, delete the `spotify` case and `SpotifyLinkRequiredError`, and drop the `spotifyAccessToken` option from `createMusicProvider`.
- [x] 1.3 In `server/core/run-generation.ts`: remove the `SpotifyNotLinkedError`/`getValidAccessToken` imports and the `spotify`-token branch; call `createMusicProvider(backendId, {})`; delete the Spotify link-required error mapping.
- [x] 1.4 Run `bunx tsc --noEmit` (or project typecheck) and fix any remaining Spotify references the compiler surfaces.

## 2. Delete the Spotify HTTP + persistence surface

- [x] 2.1 Delete the `server/spotify/` directory (client.ts, oauth.ts, tokens.ts, types.ts).
- [x] 2.2 In `server/index.ts`: remove the `createSpotifyOAuthRoutes` import and the `app.route("/spotify", …)` mount.
- [x] 2.3 In `server/api/routes.ts`: remove Spotify imports and delete the `/spotify/status`, `/spotify/link`, `/spotify/play`, `/spotify/pause`, `/spotify/next`, `/spotify/previous`, `/spotify/volume`, and `/spotify/now-playing` routes.
- [x] 2.4 In `server/db.ts`: remove the `CREATE TABLE ... spotify_tokens` statement.
- [x] 2.5 In `server/env.ts`: remove `spotifyClientId` (and any Spotify secret/redirect entries); remove the same keys from `.env.example`.

## 3. Update the bot and default backend

- [x] 3.1 In `server/bot/index.ts`: remove the `startSpotifyLink`/`hasLinkedSpotify` imports, the `/link` command, and the `backendId === "spotify"` link gate in the `message:text` handler.
- [x] 3.2 Change the default backend fallback from `getActiveBackendId(db, "spotify")` to `"youtube-music"`; grep for any other `"spotify"` default literals and update them.
- [x] 3.3 Verify `getActiveBackendId` / `isMusicBackend` treats a stored `spotify` value as invalid and falls back to `youtube-music` (add a guard if the stored value is used unchecked).

## 4. Update the Mini App API client and screens

- [x] 4.1 In `miniapp/src/lib/api.ts`: remove `spotifyStatus`, `spotifyLink`, `play`, `pause`, `next`, `previous`, and `setVolume`.
- [x] 4.2 In `miniapp/src/App.tsx`: remove `needsSpotifyLink` state, the `api.spotifyStatus` call, `handlePlay`, and the `onLinkSpotify`/`needsSpotifyLink`/`onPlay` props passed down.
- [x] 4.3 In `miniapp/src/screens/PromptScreen.tsx`: remove the `needsSpotifyLink`/`onLinkSpotify` props and the "Connect Spotify" panel.
- [x] 4.4 In `miniapp/src/screens/ResultsScreen.tsx`: remove the `onPlay` prop, the "Open on Spotify" link, and the non-deep-link "Play" branch (keep the deep-link "open in app" path only).

## 5. Fix tests and residual references

- [x] 5.1 In `server/core/generate-playlist.test.ts`: rename the `spotify` fake backend/URIs to a neutral backend (e.g. `youtube-music`) and update the expected playlist URL assertion.
- [x] 5.2 Update `deploy/miniapp.caddy` and `vite.config.ts` to drop Spotify-specific references.
- [x] 5.3 Case-insensitive grep for `spotify` across `server/`, `miniapp/src/`, and config; confirm only intentional mentions (if any) remain.

## 6. Russify the interface

- [x] 6.1 Translate all bot strings in `server/bot/index.ts` to Russian: `/start` reply + inline button, `/app` reply, `/provider` and `/backend` feedback/errors, and the clarify/error replies (keep provider/backend ids untranslated).
- [x] 6.2 Translate error/user-facing messages produced in `server/core/run-generation.ts` (and `formatPlaylistReply` labels) to Russian; keep Markdown metacharacters safe.
- [x] 6.3 Translate `miniapp/src/App.tsx` nav ("Generate"/"Settings"), the error banner framing, and the settings loading fallback to Russian.
- [x] 6.4 Translate `PromptScreen.tsx` (heading, description, placeholder, thinking/generate button) to Russian.
- [x] 6.5 Translate `ClarifyScreen.tsx` (heading, question framing) to Russian.
- [x] 6.6 Translate `ResultsScreen.tsx` ("open in app" label, "New playlist") to Russian.
- [x] 6.7 Translate `SettingsScreen.tsx` headings ("Admin settings", "AI provider", "Music backend", loading/error text) to Russian.

## 7. Docs and verification

- [x] 7.1 Update `README.md`: remove Spotify setup/OAuth/env instructions; note the Russian UI and the two remaining backends.
- [x] 7.2 Run the typecheck and `bun test`; confirm both pass with no Spotify references remaining.
- [ ] 7.3 Manually launch the bot + Mini App and confirm generation works end-to-end on `youtube-music` with a fully Russian interface.
