## Context

The app is a Telegram bot + Mini App that turns a text prompt into a real playlist via an AI agent loop and a pluggable music backend. Today three backends exist: Spotify, SoundCloud, YouTube Music. Spotify is special — it needs per-chat OAuth (`server/spotify/oauth.ts`), refreshable tokens in a `spotify_tokens` table (`server/spotify/tokens.ts`), a full API client with Connect playback (`server/spotify/client.ts`), and it is the historical default backend. SoundCloud and YouTube Music are stateless, credential-free, resolve-only backends (they return open-in-app deep links, `capabilities.remotePlaylists = false`). The UI is entirely in English.

This change removes Spotify wholesale and translates every user-facing string to Russian. It touches server (music registry, routes, bot, db, env, core), the Mini App (App + all screens + api client), config, and docs.

## Goals / Non-Goals

**Goals:**
- Delete the entire Spotify surface: backend, OAuth routes, playback API, tokens table, env vars, and all UI affordances.
- Make `youtube-music` the default backend everywhere a default is read.
- Keep SoundCloud and YouTube Music working exactly as before.
- Present all bot and Mini App text in Russian.
- Keep the code compiling and the existing test suite green (adjust the Spotify-flavored test fixture to a generic backend).

**Non-Goals:**
- No new backends, no i18n framework or language switching — Russian is hardcoded (single-locale).
- No redesign of the Mini App visual system beyond string changes.
- No data migration tooling for existing `spotify_tokens` rows (the table is simply dropped/ignored).

## Decisions

**1. Single hardcoded Russian locale, no i18n library.**
The app has a small, fixed set of strings and one audience. Introducing `i18next`/message catalogs adds ceremony with no payoff. Strings are translated in place. Alternative (i18n framework with locale files) considered and rejected as over-engineering for a single-locale app; it can be layered in later without contradicting this change.

**2. Remove Spotify at the type level to get compiler-guided completeness.**
Drop `"spotify"` from the `MusicBackend` union first. TypeScript then flags every remaining reference (registry switch, run-generation branch, test fixture), turning "did I get everything?" into a compile error rather than a manual grep. The `createMusicProvider` signature loses its `spotifyAccessToken` option and `SpotifyLinkRequiredError`.

**3. Delete rather than stub the Spotify HTTP surface.**
Remove the `/spotify/*` OAuth mount in `server/index.ts`, the `/api/spotify/*` endpoints in `routes.ts`, and the corresponding `api.spotify*`/`api.play`/player methods in `miniapp/src/lib/api.ts`. With Spotify gone, remaining backends are resolve-only, so the Mini App "Play" button path is dead — `ResultsScreen` keeps only the deep-link path, and `App.tsx` drops `handlePlay`, `needsSpotifyLink`, and the link panel.

**4. Change every default-backend fallback to `youtube-music`.**
`server/bot/index.ts` reads `getActiveBackendId(db, "spotify")` — change the fallback to `"youtube-music"` and delete the immediately-following Spotify link gate. Confirm no other `"spotify"` default literals remain.

**5. Drop `spotify_tokens` table and Spotify env vars.**
Remove the `CREATE TABLE ... spotify_tokens` statement in `server/db.ts` and `spotifyClientId` (plus any secret/redirect) from `server/env.ts` and `.env.example`. Existing DB files keep an orphaned table harmlessly; no migration needed.

**6. Keep technical ids untranslated.**
Provider/backend ids (`opencode`, `youtube-music`, etc.) shown in admin controls stay as-is; only surrounding human sentences are Russified. Admin surfaces are low-traffic and the ids are effectively identifiers.

## Risks / Trade-offs

- **Orphaned `spotify_tokens` table in existing DBs** → Harmless; the table is simply never read. Optionally note in README that it can be dropped manually. No runtime dependency remains.
- **Chats previously set to the `spotify` backend** → On next generation the stored value is an invalid backend id; ensure `getActiveBackendId`'s fallback and `isMusicBackend` validation route them to the `youtube-music` default rather than throwing. Verify the read path validates before use.
- **Missed English string** → Mitigated by a final grep for Latin-alphabet user-facing literals across `server/bot` and `miniapp/src` after translation, plus manual review of the two screens.
- **Cyrillic in Markdown bot replies** → `formatPlaylistReply` uses `parse_mode: "Markdown"`; ensure translated text does not introduce unescaped Markdown metacharacters. Keep punctuation simple.

## Migration Plan

1. Remove `"spotify"` from the type union; let the compiler enumerate breakages; fix registry, run-generation, and test fixture.
2. Delete `server/spotify/`, the OAuth mount, `/api/spotify/*` routes, the tokens table, and env vars.
3. Update Mini App: strip Spotify state/UI/api methods; keep deep-link results path.
4. Translate all bot and Mini App strings to Russian.
5. Update `.env.example`, `README.md`, and `deploy/miniapp.caddy` references.
6. Run typecheck + `bun test`; grep for residual `spotify` (case-insensitive) and residual English UI strings.

**Rollback:** revert the change commit/branch; no schema migration was applied, so no data rollback is required.

## Open Questions

- None blocking. (If desired later: expose a language toggle — deferred, out of scope.)
