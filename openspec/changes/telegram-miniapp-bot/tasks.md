## 1. Project scaffold

- [x] 1.1 Init Bun project structure (`server/`, `miniapp/`), `package.json`, `tsconfig.json`, `.gitignore` (env files, `node_modules`, build output)
- [x] 1.2 Add `.env.example` documenting all required env vars (bot token, admin chat IDs, allowlist, Spotify client ID, LLM provider keys) without real values
- [x] 1.3 Set up Hono app skeleton on Bun with a `/healthz` endpoint
- [x] 1.4 Set up `bun:sqlite` database module with schema: `allowlist` (chat_id, is_admin), `spotify_tokens` (chat_id, access_token, refresh_token, expires_at), `oauth_state` (state, chat_id, expires_at), `settings` (key, value) for active provider/backend

## 2. Access control

- [x] 2.1 Implement allowlist/admin lookup against the `allowlist` table
- [x] 2.2 Implement grammY middleware that drops updates from non-allowlisted chats before any handler runs
- [x] 2.3 Implement Telegram `initData` HMAC verification middleware for Hono API routes, deriving chat/user ID
- [x] 2.4 Implement Hono middleware that 403s admin-only routes for non-admin chat IDs (independent of UI)
- [x] 2.5 Add a bootstrap mechanism to seed the initial admin chat ID(s) from env on first run

## 3. Spotify account linking

- [x] 3.1 Implement PKCE code_verifier/code_challenge generation and per-chat `state` issuance (short TTL, single-use, stored in `oauth_state`)
- [x] 3.2 Implement `/spotify/callback` Hono route: validate `state`, exchange code for tokens, store in `spotify_tokens`
- [x] 3.3 Implement token refresh helper: check expiry before each Spotify API call, refresh via stored refresh token, clear tokens and prompt re-link on refresh failure
- [x] 3.4 Port Spotify Web API client from `spotify-harness-tui/src/spotify/client.ts` (search, playlist creation, Connect playback endpoints, 429 handling) into `server/spotify/client.ts`, parameterized per chat's tokens
- [x] 3.5 Implement bot command / Mini App action to start the link flow and report link status

## 4. AI provider abstraction

- [x] 4.1 Port `AgentProvider`/`ToolSpec`/`AgentResult` contract shape from `spotify-harness-tui/src/agent/types.ts` into `server/agent/types.ts`
- [x] 4.2 Implement API-key-based provider clients: Anthropic, OpenAI, OpenRouter (port relevant logic from `spotify-harness-tui/src/agent/providers/`, dropping `claude-cli` and any opentui-specific bits); Ollama optional
- [x] 4.3 Implement active-provider setting read/write against the `settings` table, admin-only write (enforced via task 2.4 middleware)
- [x] 4.4 Implement missing-credential check: reject generation with a clear error if the active provider's required key is unset

## 5. Music backend abstraction

- [x] 5.1 Port `MusicProvider`/`Track` contract shape from `spotify-harness-tui/src/music/types.ts` into `server/music/types.ts`
- [x] 5.2 Implement Spotify backend (search + playlist create, using task 3 client) as the playlist-capable provider
- [x] 5.3 Implement resolve-only SoundCloud/YouTube Music backends (search only, deep links, no playlist creation)
- [x] 5.4 Implement active-backend setting read/write against `settings`, admin-only write

## 6. Playlist agent loop

- [x] 6.1 Port tool loop driver from `spotify-harness-tui/src/agent/loop.ts` and tool specs from `agent/tools.ts` into `server/core/generate-playlist.ts`, wired to the active provider (§4) and active backend (§5)
- [x] 6.2 Implement bounded iteration cap and duplicate-tool-call cache guard
- [x] 6.3 Implement single clarify-question flow: pause loop, surface question to bot/Mini App, resume on reply
- [x] 6.4 Implement backend-dependent finalize: create real playlist when backend supports it, else return track list + deep links
- [x] 6.5 Write unit tests covering: max-iteration cutoff, duplicate-call guard, single-clarify enforcement, both finalize paths

## 7. Telegram bot

- [x] 7.1 Set up grammY bot instance wired to the Hono webhook route (`/bot/webhook/<secret>`)
- [x] 7.2 Implement prompt-entry flow: free-text message → run generation (§6) → reply with results
- [x] 7.3 Implement Mini App launch button (`web_app` type) pointed at `https://miniapp.xdshka.party`
- [x] 7.4 Implement Spotify link command/flow (uses §3.5)
- [x] 7.5 Implement admin-only provider/backend change commands, rejecting non-admin callers (uses §2.4, §4.3, §5.4)

## 8. Mini App frontend

- [x] 8.1 Scaffold React + Vite app under `miniapp/`, integrate Telegram WebApp SDK for `initData` + theme params
- [x] 8.2 Build Liquid Glass visual system: base layout, blurred/translucent panel component, theming for Telegram light/dark
- [x] 8.3 Build prompt-entry screen (submit mood/request, show clarify question inline when raised)
- [x] 8.4 Build results/playlist screen: track list, per-track play control, playlist link (when created)
- [x] 8.5 Build playback control surface: play/pause/skip/volume against Spotify Connect (§3.4)
- [x] 8.6 Build admin-only settings screen (active provider, active backend); ensure it is not present in the bundle's navigation/route table for non-admin sessions and is gated by the API regardless
- [x] 8.7 Wire all Mini App API calls through `initData`-authenticated requests (§2.3)

## 9. VPS deployment

- [x] 9.1 Confirm `miniapp.xdshka.party` A record points to `103.214.69.38` (user-side DNS prerequisite) before proceeding
- [x] 9.2 Provision VPS: Bun runtime, Caddy install, firewall rules for 80/443
- [x] 9.3 Write Caddyfile: automatic TLS for `miniapp.xdshka.party`, reverse-proxy `/bot/*`, `/api/*`, `/spotify/*` to the Bun process, serve Mini App static build for everything else
- [x] 9.4 Write systemd unit for the Bun server process (`Restart=on-failure`, env file reference, enabled on boot)
- [x] 9.5 Write deploy script: build Mini App locally, rsync server code + Mini App build to a new release directory on the VPS, restart systemd unit, run health check against `/healthz`
- [x] 9.6 Populate the VPS env file with the bot token, Spotify client ID, and (empty/placeholder) LLM provider keys — never committed
- [x] 9.7 Register the Telegram webhook URL against the deployed bot
- [x] 9.8 Seed the allowlist/admin table on the VPS with the intended chat IDs
- [ ] 9.9 Smoke-test end to end: allowed chat opens bot → links Spotify → generates a playlist → opens Mini App → admin-only settings confirmed hidden/rejected for a non-admin test chat

## 10. Post-deploy hygiene

- [ ] 10.1 Rotate the Telegram bot token via @BotFather (it was shared in plaintext) and update the VPS env file + webhook registration accordingly
- [x] 10.2 Document rollback procedure (previous release directory + systemd re-point) in `README.md` or an ops note
