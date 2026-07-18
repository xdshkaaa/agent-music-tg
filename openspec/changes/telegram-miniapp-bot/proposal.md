## Why

`spotify-harness-tui` proved an agentic mood-to-playlist flow (LLM picks tracks via tool calls against the Spotify Web API) inside a terminal UI. The goal now is to bring that same capability to Telegram — a bot + Mini App — so a small, fixed set of people (not the general public) can generate and play Spotify playlists from their phone, with a "Liquid Glass" (frosted glass / translucent) visual style. Access must be restricted to an allowlist of Telegram chat IDs, and only the admin chat may change which AI provider or music backend powers generation — regular allowed users never see that control.

## What Changes

- New Telegram bot (grammY on Bun) that responds only to allowlisted chat IDs; everyone else is silently ignored (no leak of bot existence/behavior).
- New Telegram Mini App (React + Vite, Telegram WebApp SDK, Liquid Glass / glassmorphism UI) launched from the bot via a `web_app` button, served over HTTPS at `miniapp.xdshka.party`.
- Ported agentic playlist generation from `spotify-harness-tui`: mood/text prompt → multi-turn LLM tool loop (`searchTrack`, `searchArtist`, `getArtistTopTracks`, `clarify`, `finalize_playlist`) → resolved Spotify playlist. Reimplemented server-side (no opentui/TUI-specific code carried over).
- Per-user Spotify account linking: each allowlisted chat authorizes their own Spotify account via PKCE OAuth (loopback-style flow adapted to a server redirect URI under `miniapp.xdshka.party`); playback is controlled remotely via Spotify Connect on the user's own device.
- Admin-only settings surface (bot command + Mini App panel) to switch the active AI provider (Claude CLI/API, OpenAI, OpenRouter, Ollama — subset of `spotify-harness-tui`'s providers, minus opentui-only bits) and the active music backend (Spotify primary; SoundCloud/YouTube Music as link-resolve fallback, since there is no local playback device on a VPS). Regular allowlisted users never see or can trigger this setting.
- VPS deployment architecture: systemd-managed bot + API process, Caddy (or nginx) reverse proxy terminating TLS for `miniapp.xdshka.party` via Let's Encrypt, static Mini App build served alongside the API.
- **BREAKING**: N/A — greenfield project, no prior deployed version.

## Capabilities

### New Capabilities
- `access-control`: Chat ID allowlist enforcement, admin vs. regular-user role distinction, and hiding admin-only affordances (commands, Mini App panels) from non-admin allowed users.
- `playlist-agent`: The agentic mood → playlist generation loop (LLM tool-calling against Spotify search/catalog, clarify-once behavior, bounded iterations, finalize into a playlist).
- `spotify-account`: Per-chat Spotify PKCE OAuth linking, token storage/refresh, and Spotify Connect playback control (play/pause/skip/volume) driven from the bot/Mini App.
- `telegram-miniapp`: The Mini App frontend itself — Liquid Glass visual design, screens for prompt entry, results/playlist view, playback controls, and the admin-only settings panel — plus the API endpoints it calls.
- `deployment`: VPS provisioning and deploy process — process management, reverse proxy + TLS for `miniapp.xdshka.party`, secrets handling, release/update flow.

### Modified Capabilities
- None (no existing specs in this repo).

## Impact

- **New repo build-out**: this repo currently has no application code (only `openspec/` scaffolding) — this change defines the initial architecture and full implementation surface.
- **External accounts/services**: Telegram Bot API (bot token provided by user — must be stored only in a server-side `.env`/systemd environment file, never committed), Spotify Web API + a Spotify Developer app (client ID, PKCE — no secret needed), optionally SoundCloud/YouTube Music resolution, one or more LLM provider credentials (Claude/OpenAI/OpenRouter/Ollama) supplied by the admin.
- **DNS/infra prerequisite**: `miniapp.xdshka.party` must have an A record pointing at `YOUR_VPS_IP` before TLS issuance will succeed.
- **VPS**: `root@YOUR_VPS_IP` — new systemd services, reverse proxy config, firewall rule for 80/443, deployed application directories.
- **Security-sensitive surfaces**: chat ID allowlist gate (must fail closed), admin-only provider/backend switch (must be unreachable by regular users at both bot-command and Mini App API level, not just hidden in UI), per-user OAuth token storage at rest.
