## Why

Spotify integration forces every user through an OAuth account-linking step and only works for accounts the app is authorized for, while SoundCloud and YouTube Music already deliver real, link-free playlists. Dropping Spotify removes a large auth/token/playback surface with no upside for the target audience. That audience is Russian-speaking, so the English-only interface is a usability barrier.

## What Changes

- **BREAKING** Remove Spotify as a music backend: delete `server/spotify/` (client, OAuth, tokens, types), drop `"spotify"` from the `MusicBackend` union and `AVAILABLE_BACKENDS`, and remove it from the provider registry.
- **BREAKING** Remove all Spotify HTTP surface: the `/spotify/*` OAuth callback routes and the `/api/spotify/*` endpoints (status, link, play, pause, next, previous, volume, now-playing).
- **BREAKING** Remove account linking: delete the `/link` bot command, the "link Spotify first" gate on text messages, and the `spotify_tokens` DB table.
- Remove Spotify Connect playback controls; remaining backends are resolve-only (open-in-app deep links), so the Mini App "Play" path and player API methods go away.
- Change the default music backend from `spotify` to `youtube-music` everywhere a default is read.
- Remove `SPOTIFY_CLIENT_ID` (and related) from env config and `.env.example`.
- Drop Spotify Mini App UI: `needsSpotifyLink` state, the "Connect Spotify" panel, and the "Open on Spotify" link.
- Translate the entire user-facing interface to Russian: all Mini App screens (headings, buttons, placeholders, statuses) and all bot messages/command replies.
- Update `README.md` to drop Spotify setup and reflect the Russian UI.

## Capabilities

### New Capabilities
- `music-backend-selection`: which music backends the app offers (SoundCloud, YouTube Music), how the active one is chosen, and that no per-user account linking or OAuth is required to generate a playlist.
- `russian-localization`: all user-facing text across the Telegram bot and the Mini App is presented in Russian.

### Modified Capabilities
<!-- No existing spec files in openspec/specs/; behavior is captured as new capabilities above. -->

## Impact

- **Deleted:** `server/spotify/` (all files); `spotify_tokens` schema in `server/db.ts`.
- **Modified server:** `server/music/registry.ts`, `server/music/types.ts`, `server/core/run-generation.ts`, `server/api/routes.ts`, `server/index.ts`, `server/bot/index.ts`, `server/env.ts`, `server/core/generate-playlist.test.ts`.
- **Modified Mini App:** `miniapp/src/App.tsx`, `miniapp/src/lib/api.ts`, and all screens under `miniapp/src/screens/`.
- **Config/docs:** `.env.example`, `README.md`, `deploy/miniapp.caddy` (Spotify references), `vite.config.ts`.
- **Behavioral:** existing chats with a linked Spotify backend must fall back to a default backend; the `/link` command disappears.
