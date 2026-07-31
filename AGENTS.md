# spotify-harness-tg

Telegram bot + Mini App that turns a mood/request into a playlist via an AI agent. Russian interface. Music from SoundCloud or YouTube Music (no OAuth).

## Commands

- `bun run dev` — Start dev server with watch
- `bun test` — Run server tests
- `bun run typecheck` — Type-check without building
- `bun run build:miniapp` — Build the Mini App
- `./deploy/deploy.sh` — Deploy to VPS (builds miniapp, rsyncs, restarts systemd unit)
  - `--dry-run` — Show what would be done without executing
  - `--no-typecheck` — Skip TypeScript type check
  - `--dirty` — Allow deploy with uncommitted changes or from non-main branch

**Agent deploy rule**: always deploy via `./deploy/deploy-test.sh`, never `deploy.sh` or manual steps, unless user explicitly says otherwise.

**Agent commit rule**: after each successful iteration (a change that's complete and verified — e.g. typecheck/tests pass), create a git commit right away without waiting to be asked. Pre-authorized for this repo; still skip files that look like secrets and follow the git safety protocol otherwise.

**Agent deploy-test rule**: after each successful iteration's commit, also run `./deploy/deploy-test.sh` right away without waiting to be asked. Pre-authorized for this repo.

**Agent release notes rule**: after each successful iteration's commit, also write release notes in **Russian**, formatted for a Telegram post (short bolded heading via `*...*`, a tight bullet list of what changed, no walls of text, emoji used sparingly if at all). Save each as its own file under `release-notes/`, named `YYYY-MM-DD-<short-sha>.md` (date and short SHA of the commit it describes).

## Setup

```bash
bun install
cp .env.example .env
# Fill in: TELEGRAM_BOT_TOKEN, ALLOWLIST_CHAT_IDS, ADMIN_CHAT_IDS, at least one LLM key
```

## Gotchas

- Bot uses **long-polling** only — no public webhook route, no `/api/bot` endpoint
- Audio downloads require `yt-dlp` + `ffmpeg` on the VPS (installed by `deploy.sh`)
- Payments: must create Crypto Pay app in @CryptoBot, set `CRYPTOBOT_TOKEN`, and configure webhook URL to `PUBLIC_ORIGIN/api/crypto/webhook`
- Kill switch for paywall: set `PAYMENTS_ENABLED=false` and restart the systemd unit
- Admin panel via `/admin` bot command or «Админ» tab in Mini App
- Default music backend is `youtube-music`; `soundcloud` also available — neither needs credentials
- Group-chat keyword search («найти ...») needs bot **privacy mode disabled** in @BotFather (`/setprivacy` → Disable) to see plain text; groups already added must be removed and re-added after the change
- Inline search (`@bot <query>` in any chat) needs `/setinline` in @BotFather to appear at all; pre-warming the audio cache in the background also needs `AUDIO_STORAGE_CHAT_ID` (a private channel, bot as admin) — without it, inline only answers from whatever's already cached

## Conventions

- All user-facing text is in **Russian**
- Access restricted to allowlist (`ALLOWLIST_CHAT_IDS`), admin flag controls provider/backend settings
- Payment amounts in the currency returned by Crypto Pay API (USD/RUB/etc), stored as integer minor units

## References

- @README.md — full project docs, deploy/rollback, payment setup, audio download endpoints
- .env.example — required env vars
