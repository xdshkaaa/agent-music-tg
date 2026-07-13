# agent-music-tg

Telegram bot + Mini App that turns a mood/request into a real playlist via an AI agent, ported from [spotify-harness-tui](https://github.com/pyfig/agent-music-spotify). Restricted to an allowlist of chat IDs; only admins can change the active AI provider / music backend.

- **Bot**: `@music_agentbot`, long-polling (no public webhook route).
- **Mini App**: https://miniapp.xdshka.party — Liquid Glass UI, prompt entry, results/playback, admin-only settings.
- **Backend**: Bun + Hono (`server/`), `bun:sqlite` for allowlist/tokens/settings.

See `openspec/changes/telegram-miniapp-bot/` for the full proposal/design/specs/tasks behind this build.

## Run locally

```bash
bun install
cp .env.example .env   # fill in TELEGRAM_BOT_TOKEN, ALLOWLIST_CHAT_IDS, ADMIN_CHAT_IDS, at least one LLM key
bun run dev
```

## Test

```bash
bun test              # server
cd miniapp && bun run build   # typecheck + build the Mini App
```

## Deploy

```bash
./deploy/deploy.sh
```

Builds the Mini App locally, rsyncs server code to `/opt/agent-music-tg` and the static build to `/srv/www/miniapp.xdshka.party` on the VPS, restarts the `agent-music-tg` systemd unit, and health-checks `/healthz`.

Infra on the VPS (already wired, only touch if changing ports/domains):
- `/etc/caddy/Caddyfile` — site block on `:8094` (see `deploy/miniapp.caddy`), reverse-proxying `/api/*` and `/spotify/*` to `127.0.0.1:8787` and serving the Mini App static build for everything else.
- `/etc/cloudflared/config.yml` — ingress rule routing `miniapp.xdshka.party` to `localhost:8094` (this box has no direct A record; Cloudflare Tunnel handles public routing and TLS termination for every hostname on it).
- `/opt/agent-music-tg/.env` — secrets, not in git. `/opt/agent-music-tg/data/app.sqlite` — allowlist, Spotify tokens, active provider/backend settings.

### Rollback

Every deploy lands in a timestamped `releases/<ts>` dir under both `/opt/agent-music-tg` and `/srv/www/miniapp.xdshka.party`, with `current` symlinked to the latest. To roll back:

```bash
ssh root@103.214.69.38
ls /opt/agent-music-tg/releases          # pick the previous timestamp
ln -sfn /opt/agent-music-tg/releases/<previous> /opt/agent-music-tg/current
ln -sfn /srv/www/miniapp.xdshka.party/releases/<previous> /srv/www/miniapp.xdshka.party/current
systemctl restart agent-music-tg
curl -fsS http://127.0.0.1:8787/healthz
```

### Known follow-ups

- `SPOTIFY_CLIENT_ID` is unset — the `spotify` backend and `/link` won't work until a Spotify Developer app is created (redirect URI `https://miniapp.xdshka.party/spotify/callback`, PKCE, no secret) and the ID added to `/opt/agent-music-tg/.env`, then `systemctl restart agent-music-tg`. Default backend is `youtube-music`, which needs no credentials.
- The bot token was shared in plaintext during setup — rotate it via @BotFather when convenient, then update `TELEGRAM_BOT_TOKEN` in `/opt/agent-music-tg/.env` and restart.
