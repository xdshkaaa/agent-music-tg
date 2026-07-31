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

## Agent workflow

**Deploy rule**: always deploy via `./deploy/deploy-test.sh`, never `deploy.sh` or manual steps, unless the user explicitly says otherwise. Never deploy when a required verification step has failed.

**Successful iteration**: an iteration is complete only when the requested change is implemented, relevant documentation and `.env.example` are updated when applicable, and proportionate verification passes:

- Always run `bun run typecheck` for TypeScript changes.
- Run `bun test` for server or shared-logic changes.
- Run `bun run build:miniapp` for Mini App changes.
- Run focused tests or checks for the changed area when available.
- Documentation-only changes may be verified by reviewing the rendered content and diff; they do not require unrelated builds or tests.

**Commit and release sequence**: after each successful iteration, perform this sequence without waiting to be asked:

1. Review `git status`, the diff, and the staged file list. Exclude unrelated user changes and anything that looks like a secret.
2. Create the functional commit using a Conventional Commit prefix such as `feat:`, `fix:`, `test:`, `docs:`, or `chore:`.
3. Create Russian release notes for that functional commit under `release-notes/YYYY-MM-DD-<functional-short-sha>.md`. Format them as a Telegram post: a short bold heading using `*...*`, a tight bullet list, no walls of text, and sparing emoji.
4. Commit only the release-notes file in a separate commit named `docs: release notes for <functional-short-sha>`.
5. Run `./deploy/deploy-test.sh` from the resulting `HEAD`.

Do not amend, rebase, force-push, push, or automatically roll back commits unless the user explicitly requests it. If deployment fails, preserve the commits, collect the relevant error output, report the status, and do not retry indefinitely.

## Safety and scope

- Preserve pre-existing and unrelated worktree changes; never include them in an agent commit.
- Keep changes scoped to the request. Avoid opportunistic refactors and public API changes unrelated to the task.
- Do not read, print, log, commit, or expose secrets, tokens, private chat IDs, webhook secrets, or `.env` values. Redact sensitive values from diagnostics.
- Do not change production or test databases manually. Data migrations must be backward-compatible; destructive schema changes require explicit user approval and a separate rollout plan.
- Do not add a dependency unless it is necessary. Keep Bun as the package manager and commit the lockfile whenever dependencies change.
- Tests must not send real Telegram messages, create real Crypto Pay invoices, or perform heavyweight audio downloads unless the user explicitly requests an integration test against a designated test environment.
- External and background operations must use appropriate timeouts. Retries must be bounded, use backoff where appropriate, and remain idempotent. Clean up temporary audio files.
- Treat `deploy-test` as the only default deployment target. Production deployment requires an explicit user request.

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
