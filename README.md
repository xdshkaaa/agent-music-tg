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
ssh root@YOUR_VPS_IP
ls /opt/agent-music-tg/releases          # pick the previous release
ln -sfn /opt/agent-music-tg/releases/<previous> /opt/agent-music-tg/current
ln -sfn /srv/www/miniapp.xdshka.party/releases/<previous> /srv/www/miniapp.xdshka.party/current
systemctl restart agent-music-tg
curl -fsS http://127.0.0.1:8787/healthz
```

## Audio downloads & in-app playback

Playlist results can be downloaded as audio: the Mini App's «Скачать» button queues a server-side job that resolves a progressive audio stream with **yt-dlp** and pipes it straight into Telegram, overlapping the upstream download with the Bot API upload instead of first waiting for a complete temporary file. If streaming is unavailable or Telegram rejects it, the existing **yt-dlp** (+ **ffmpeg**) file extraction path takes over automatically (`deploy.sh` installs/updates both tools on the VPS). Uploaded tracks are cached by Telegram `file_id` (`audio_cache` table), so repeats never re-extract or re-upload. Download history lives in the profile's «Загрузки» tab with re-send and delete. Tracks also play inline in the Mini App via `GET /api/stream/:uri` (Range-supporting, initData-authenticated via query param).

The fast streaming path uses the catalog duration because bytes are never written as a complete local file. The file fallback measures the produced audio with **ffprobe**, and that measured value wins whenever available. Either value is cached with the `file_id`, so re-sends carry it too. SoundCloud results that are preview-only (`policy: SNIP`) or have no playable transcoding (`policy: BLOCK`) are dropped at search time rather than surfaced as songs.

Endpoints (all under initData auth): `POST /api/download`, `GET /api/downloads`, `POST /api/downloads/:id/resend`, `DELETE /api/downloads/:id`, `GET /api/stream/:uri`.

Config (`.env`): `AUDIO_SCRATCH_DIR` (temporary files for chat downloads, deleted after upload).

## Sharing playlists

Any generation result or saved playlist can be published as a link («Поделиться»). Publishing snapshots the tracklist, so editing or deleting the source never changes a link already in circulation, and publishing the same source twice returns the same link. Recipients open it in Telegram, see the tracklist with the author and the original prompt, play it in the Mini App, and can save it to their own playlists or generate their own.

Links take the form `https://t.me/<bot>?start=pl_<token>`. Set the optional `TELEGRAM_MINIAPP_NAME` (the Mini App short name from BotFather) to have them open the Mini App directly as `https://t.me/<bot>/<name>?startapp=pl_<token>` instead.

Arrivals are attributed to `share / telegram / shared-playlist` in admin statistics and credit the author through the existing referral reward, with the same per-invitee dedupe and cap. `GET /api/shares/:token` is the one route that serves callers who are not on the allowlist — that is what lets a link work for someone who is not a user yet; publishing, listing, and revoking stay behind the normal gate. Authors can revoke a link at any time (it then answers 410) and see its view count.

Endpoints: `POST /api/shares`, `GET /api/shares`, `GET /api/shares/:token`, `DELETE /api/shares/:token`.

## Group-chat keyword search

Added to any group chat (no allowlist entry needed — a group is not a user), the bot answers `найти <название трека>` — or `@bot <название трека>`, for when [privacy mode](https://core.telegram.org/bots/features#privacy-mode) is still enabled and it never sees plain text — by sending the first matching result straight into the chat. A reply to the bot's own message is deliberately *not* a trigger: it's as often conversational ("где?", "спасибо") as a new search, and a wrong-track false positive is worse than requiring the keyword or mention. **Turn privacy mode off** (`@BotFather` → `/setprivacy` → **Disable**) for the keyword to work without a mention; existing group memberships need the bot removed and re-added for the change to take effect.

The first request for an uncached track uses the streaming path above; every later request for that track, in any chat, is a `file_id` re-send from `audio_cache` and lands almost instantly. Concurrent requests for the same not-yet-cached track are coalesced so only one delivery runs. A separate `groupExtractRateLimiter` (5/min per group) caps cache misses so one busy group can't starve shared audio capacity.

Groups never touch the `users` table — no signup credits, no "new user" admin alert, no seat in per-user analytics or broadcast — they get their own counters in `group_chats` instead, surfaced in admin statistics as active groups / searches / tracks sent.

## Inline search in any chat

Typing `@<bot> <название трека>` in *any* chat — a DM with someone else, a group the bot was never added to, anywhere Telegram allows invoking an inline bot — pops up a list of tracks; tapping one sends it as playable audio from your own name. Open to everyone, same as group keyword search, guarded only by rate limits (no allowlist gate).

Requires two one-time steps in `@BotFather`: **`/setinline`** (turns on the feature at all; set a placeholder like «название трека») and, optionally, **`/setinlinefeedback`** → `Enabled` (lets the bot count tracks actually sent via `chosen_inline_result`, for admin stats only — search still works without it).

Telegram requires answering an inline query within a few seconds, and only accepts already-uploaded audio (`audio_file_id`) as a result — there's no way to turn a placeholder into playable audio afterward. So a query answers instantly from whatever `audio_cache` already has, while cache misses are uploaded in the background to a private **storage channel**, purely to mint a reusable `file_id`. Set `AUDIO_STORAGE_CHAT_ID` to a channel where the bot is an admin with post rights. The same low-priority queue also warms the first result after Mini App and private-bot searches; it deduplicates URIs, processes one track at a time, and starts at most ten new tracks per minute. Without the channel, search still works but background warming is disabled.

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

### Traffic attribution and funnel analytics

Admin statistics also show first-touch traffic sources, UTM campaigns, cohort conversion, and the unique-user funnel from acquisition through playlist generation and payment. Existing users from before this feature are labeled `unknown / legacy`; reconstructable historical generation, checkout, and purchase events are backfilled automatically.

Telegram deep links carry attribution in the start payload:

```text
https://t.me/<bot>?start=utm_<source>__<medium>__<campaign>__[content]__[term]
https://t.me/<bot>/<mini-app>?startapp=utm_<source>__<medium>__<campaign>__[content]__[term]
```

Example: `utm_vk__cpc__summer-2026__banner-a`. Use URL-safe slugs (`A-Z`, `a-z`, `0-9`, `_`, `-`) and keep the complete payload within Telegram's 64-character limit. A source-only link can use `src_youtube`. Referral payloads (`ref_<chatId>`) remain supported and are attributed as `referral / telegram`.

### Rollback / kill switch

Set `PAYMENTS_ENABLED=false` in `/opt/agent-music-tg/.env` and restart the unit: the paywall is bypassed (everyone generates for free, no credits consumed). Tables (`users`, `offers`, `invoices`) stay in place, harmless. Full removal = revert the deploy (see Rollback above).

### Known follow-ups

- Default backend is `youtube-music`; `soundcloud` is also available. Neither needs credentials — no per-user account linking or OAuth.
- The bot token was shared in plaintext during setup — rotate it via @BotFather when convenient, then update `TELEGRAM_BOT_TOKEN` in `/opt/agent-music-tg/.env` and restart.
