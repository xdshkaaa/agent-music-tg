## Context

This is a greenfield build in an otherwise empty repo. It reuses the *concepts* proven in `spotify-harness-tui` (agentic LLM tool loop over a music-provider abstraction, multi-provider LLM axis) but the runtime target is completely different: a always-on Telegram bot + web-based Mini App on a single VPS, serving a small fixed set of chat IDs, instead of a single-user local TUI. None of `spotify-harness-tui`'s opentui/TUI code, local config-dir layout, or mpv-based local playback carries over as-is.

Constraints fixed by the user up front:
- VPS target: `root@YOUR_VPS_IP` (deploy over SSH).
- Bot token already issued: `8841965774:AAEa...` (must never be committed; lives only in a server-side env file).
- Mini App domain: `miniapp.xdshka.party` (user owns it; A record → `YOUR_VPS_IP` is a deploy prerequisite).
- Chat ID allowlist gates all access; a subset of the allowlist are admins.
- Only admins may change the active AI provider and active music backend; regular allowed users must not see that control at all (not just visually hidden — unreachable).
- Each allowed chat links its own Spotify account (PKCE OAuth), playback via Spotify Connect on that user's own device.

## Goals / Non-Goals

**Goals:**
- Port the agentic mood → playlist loop (LLM tool-calling: search tracks/artists, clarify once, finalize) to a server context, provider-agnostic on the LLM side.
- Telegram bot as the entry point (allowlist-gated); Mini App as the rich UI, opened via a `web_app` button, styled Liquid Glass.
- Per-chat Spotify account linking and Spotify Connect playback control.
- Admin-only, server-enforced control over active LLM provider and active music backend.
- Single-VPS deployment: one process for bot+API, Caddy for TLS + static Mini App hosting, systemd for process supervision.

**Non-Goals (this change):**
- Feature parity with every `spotify-harness-tui` extra (lyrics, taste memory, session history browsing) — out of scope for v1, can follow as a later change.
- Active server-side playback (mpv-style) for SoundCloud/YouTube Music — there is no "local device" concept on a VPS; those backends degrade to track resolution + open-in-app links rather than transport control.
- Multi-VPS/HA deployment, autoscaling, or zero-downtime blue/green releases.
- Public/open sign-up — the allowlist is the only membership mechanism; no self-service registration.

## Decisions

**Runtime & bot framework: Bun + grammY.**
Bun matches the reference project's tooling (native TS, fast startup, `bun:sqlite` built in). grammY over Telegraf: first-class TypeScript types, built-in support for Mini App (`web_app` buttons, `initData` validation helpers), actively maintained. Alternative considered: Telegraf — more prevalent but weaker TS ergonomics and no built-in `initData` verification helper.

**Single process serves bot + Mini App API + static build.**
One Bun HTTP server (using `Hono` for routing) handles: the Telegram webhook endpoint, the Mini App's REST API, the Spotify OAuth callback, and serves the built Mini App static assets. One systemd unit, one log stream, one thing to restart. Alternative considered: split bot/API/static into separate processes — rejected as needless operational overhead for this scale (a handful of chat IDs).

**Webhook, not long polling.**
Since Caddy + a valid TLS domain is already required for the Mini App, register a Telegram webhook (`https://miniapp.xdshka.party/bot/webhook/<secret-path-segment>`) instead of long polling. Lower latency, no extra polling loop, and grammY's webhook adapter integrates directly into the Hono server.

**State storage: `bun:sqlite`, one file, on the VPS.**
Holds: allowlist + admin flags, per-chat Spotify tokens (access/refresh + expiry), per-chat active playlist/session state, and the single global "active provider / active backend" admin setting. SQLite over flat JSON (amusic's approach) because multiple chats hit the process concurrently — JSON file read-modify-write is not safe under concurrent requests; SQLite gives that for free. Single global provider/backend setting (not per-chat) matches the proposal: the admin sets it once for everyone.

**LLM provider axis ported as an interface, trimmed to server-friendly backends.**
Reuse the shape of `spotify-harness-tui`'s `AgentProvider`/`ToolSpec` contract (`agent/types.ts`, `agent/tools.ts`, `agent/loop.ts`) but drop `claude-cli` (shells out to a local `claude` binary — not appropriate for an unattended VPS process) in favor of API-key-based providers only: Anthropic API, OpenAI, OpenRouter, and optionally Ollama if the admin runs a local model on the VPS. Admin selects the active one; picking one whose required key is unset is rejected server-side with a clear error.

**Music provider axis: Spotify is primary and fully interactive; SoundCloud/YouTube Music are resolve-only.**
Port `music/types.ts`'s `MusicProvider` shape for track/artist search so the agent loop stays backend-agnostic, but only Spotify gets a `finalize_playlist` → real playlist + Connect playback path. If the admin switches the backend to SoundCloud/YouTube Music, `finalize_playlist` returns a track list with deep links instead of creating a remote playlist (documented limitation, not a bug).

**Spotify OAuth: PKCE with a server-hosted redirect URI, one link per chat.**
Redirect URI is `https://miniapp.xdshka.party/spotify/callback` (not a loopback port, since this runs on a server). Flow: bot/Mini App sends the user a per-chat authorize link with `state` bound to their chat ID (stored server-side with a short TTL); callback verifies `state`, exchanges the code, stores refresh token in SQLite keyed by chat ID. Token refresh happens lazily on API calls, mirroring `spotify-harness-tui`'s `auth.ts`.

**Mini App auth: Telegram `initData` HMAC verification, not a separate login.**
Every Mini App → API request carries Telegram's `initData`; the API verifies its HMAC signature against the bot token (per Telegram's Mini Apps spec) to recover the calling `chat`/`user` id, then checks it against the allowlist/admin table server-side. This is the actual enforcement boundary for admin-only endpoints — the Mini App UI also hides the settings panel for non-admins, but that's cosmetic; the API must independently 403 a non-admin call even if someone crafts the request by hand.

**Liquid Glass styling: CSS-only, no heavy UI framework.**
Frosted-glass panels via `backdrop-filter: blur()` + translucent gradients + subtle inner/outer shadows and a thin light-catching top border, layered over a blurred/animated background — the current "Liquid Glass" look popularized by recent Apple platform design. Plain React + CSS (or Tailwind with custom utilities), no heavyweight component library, to keep the Mini App bundle small over mobile connections.

**Deployment: build locally, rsync artifacts, systemd + Caddy on the VPS.**
Mini App is built into static assets locally (or in CI) and the server bundle + `node_modules`/Bun install happen on the VPS; both are rsynced over SSH to a release directory, then a systemd unit is restarted. Caddy fronts everything: automatic TLS for `miniapp.xdshka.party` via its built-in ACME client, reverse-proxying `/bot/*`, `/api/*`, `/spotify/*` to the Bun process and serving the Mini App's static build directly for everything else.

## Risks / Trade-offs

- **Bot token was shared in a plaintext chat message** → Recommend rotating it via @BotFather after initial setup and storing only in the VPS's env file (never in git, never logged). Not blocking the build, but flagged for the user to act on.
- **Single VPS, single process** → one crash takes bot + Mini App + Spotify callback down together. Mitigation: systemd `Restart=on-failure`, plus Caddy staying up independently so static assets/health endpoint remain reachable.
- **Admin control must be enforced server-side, not just hidden in the UI** → Mitigation: every admin-only Hono route re-checks the caller's chat ID against the admin table from `initData`/webhook update, independent of what the Mini App renders.
- **SoundCloud/YouTube Music backends can't actually play anything on a VPS** (no local audio device tied to a "user") → Mitigation: explicitly scope them to resolve-only + deep-link behavior in the spec, not silently degraded UX.
- **DNS not yet pointed at the VPS** → Caddy's automatic TLS issuance will fail until `miniapp.xdshka.party` resolves to `YOUR_VPS_IP`. This is a hard prerequisite the user must complete before/at deploy time.
- **PKCE `state`/`code_verifier` must not leak across chats** → Mitigation: bind `state` to chat ID with a short TTL in SQLite, single-use.

## Migration Plan

Greenfield — no existing deployment to migrate from. Rollout is: build → rsync to a new release directory on the VPS → point systemd at it → restart → verify webhook + Mini App load → set Telegram webhook URL. Rollback is keeping the previous release directory and re-pointing systemd + restarting if the new one fails health checks.

## Open Questions

- Exact LLM provider(s)/API key(s) the admin will actually configure at launch — deploy can proceed with the provider abstraction in place and zero keys set (admin fills them in via `/admin` after deploy).
- Whether to keep the bot token given in this conversation or have the user rotate it before go-live (recommended, not required to proceed).
