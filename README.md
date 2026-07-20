# agent-music-tg

Telegram bot + Mini App that turns a mood/request into a real playlist via an AI agent. The interface is in Russian. Music comes from SoundCloud or YouTube Music (no account linking or OAuth required). Restricted to an allowlist of chat IDs; only admins can change the active AI provider / music backend.

- **Bot**: `@music_agentbot`, long-polling (no public webhook route).
- **Mini App**: https://miniapp.xdshka.party — Liquid Glass UI, prompt entry, results, admin-only settings.
- **Backend**: Bun + Hono (`server/`), `bun:sqlite` for allowlist/settings.

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
./deploy/deploy.sh                  # standard deploy
./deploy/deploy.sh --dry-run        # dry-run (pre-flight only, no changes)
./deploy/deploy.sh --no-typecheck   # skip tsc type check
./deploy/deploy.sh --dirty          # allow from dirty tree or non-main branch
```

Builds the Mini App locally, rsyncs server code to `/opt/agent-music-tg` and the static build to `/srv/www/miniapp.xdshka.party` on the VPS, restarts the `agent-music-tg` systemd unit, and health-checks `/healthz`.

Pre-flight checks run before any changes: git status, branch, `bun run typecheck`, SSH connectivity, and `.env` presence on the VPS. The release directory name includes the git commit SHA for traceability (e.g. `20250714-171509-a1b2c3d`).

If the health check fails, the script automatically rolls back to the previous release and restarts the service. On success, old releases beyond the 5 most recent are pruned. On success or failure, a Telegram notification is sent to the admin.

Infra on the VPS (already wired, only touch if changing ports/domains):
- `/etc/caddy/Caddyfile` — site block on `:8094` (see `deploy/miniapp.caddy`), reverse-proxying `/api/*` to `127.0.0.1:8787` and serving the Mini App static build for everything else.
- `/etc/cloudflared/config.yml` — ingress rule routing `miniapp.xdshka.party` to `localhost:8094` (this box has no direct A record; Cloudflare Tunnel handles public routing and TLS termination for every hostname on it).
- `/opt/agent-music-tg/.env` — secrets, not in git. `/opt/agent-music-tg/data/app.sqlite` — allowlist, active provider/backend settings.

### Rollback

Every deploy lands in a `releases/<ts>-<sha>` dir under both `/opt/agent-music-tg` and `/srv/www/miniapp.xdshka.party`, with `current` symlinked to the latest. Automatic rollback happens on health check failure. To manually roll back:

```bash
ssh root@103.214.69.38
ls /opt/agent-music-tg/releases          # pick the previous release
ln -sfn /opt/agent-music-tg/releases/<previous> /opt/agent-music-tg/current
ln -sfn /srv/www/miniapp.xdshka.party/releases/<previous> /srv/www/miniapp.xdshka.party/current
systemctl restart agent-music-tg
curl -fsS http://127.0.0.1:8787/healthz
```

## Audio downloads & in-app playback

Playlist results can be downloaded as audio: the Mini App's «Скачать» button queues a server-side job that extracts each track via **yt-dlp** (+ **ffmpeg**) and delivers it to the user's bot chat as audio messages (`deploy.sh` installs/updates both tools on the VPS). Uploaded tracks are cached by Telegram `file_id` (`audio_cache` table), so repeats never re-extract or re-upload. Download history lives in the profile's «Загрузки» tab with re-send and delete. Tracks also play inline in the Mini App via `GET /api/stream/:uri` (Range-supporting, initData-authenticated via query param): the server resolves a short-lived upstream audio URL with `yt-dlp` and proxies bytes immediately without downloading or transcoding a full MP3 first.

Endpoints (all under initData auth): `POST /api/download`, `GET /api/downloads`, `POST /api/downloads/:id/resend`, `DELETE /api/downloads/:id`, `GET /api/stream/:uri`.

Config (`.env`): `AUDIO_SCRATCH_DIR` (temporary files for chat downloads, deleted after upload).

## Payments (CryptoBot)

Playlist generation is paywalled: a user needs either generation credits or an active subscription, both sold as offers paid through [Crypto Pay](https://help.crypt.bot/crypto-pay-api) (@CryptoBot). Payment confirmation comes from a signed webhook at `POST /api/crypto/webhook`, with a polling fallback (`getInvoices`) that fulfills invoices if a webhook is missed. Fulfillment is idempotent per invoice — duplicate webhook + poll events grant exactly once.

### Setup

1. Create a Crypto Pay app: message @CryptoBot (or @CryptoTestnetBot for testnet) → Crypto Pay → Create App, copy the API token.
2. Set env vars in `.env` (see `.env.example`):
   - `CRYPTOBOT_TOKEN` — the Crypto Pay app token (required when payments are on).
   - `CRYPTOBOT_NETWORK` — `mainnet` (default) or `testnet`.
   - `PAYMENTS_ENABLED` — `true` by default.
3. In the Crypto Pay app settings, set the webhook URL to `https://miniapp.xdshka.party/api/crypto/webhook` (`PUBLIC_ORIGIN` + `/api/crypto/webhook`). The route is mounted before auth and verifies the `crypto-pay-api-signature` header (HMAC-SHA256 of the raw body keyed by SHA256 of the token); unsigned or mis-signed requests are rejected.
4. Create offers via the admin panel (below) — each offer grants either N generation credits or M days of subscription. Subscription users generate without spending credits; credit users spend one credit per *successful* generation (failed runs and clarification rounds are free).

Users buy via `/buy` in the bot or the «Магазин» tab in the Mini App, and check balance/history via `/profile` or the same tab.

### Admin panel

Admins (`ADMIN_CHAT_IDS` or allowlist admin flag) get:

- **Bot**: `/admin` inline menu — statistics (users / paid purchases / revenue), offer management, broadcast to all known users, shop settings (name, support contact, about text).
- **Mini App**: «Админ» tab with the same stats/offers/broadcast/shop-settings, plus «Настройки» for the AI provider / music backend.

### Rollback / kill switch

Set `PAYMENTS_ENABLED=false` in `/opt/agent-music-tg/.env` and restart the unit: the paywall is bypassed (everyone generates for free, no credits consumed). Tables (`users`, `offers`, `invoices`) stay in place, harmless. Full removal = revert the deploy (see Rollback above).

### Known follow-ups

- Default backend is `youtube-music`; `soundcloud` is also available. Neither needs credentials — no per-user account linking or OAuth.
- The bot token was shared in plaintext during setup — rotate it via @BotFather when convenient, then update `TELEGRAM_BOT_TOKEN` in `/opt/agent-music-tg/.env` and restart.
