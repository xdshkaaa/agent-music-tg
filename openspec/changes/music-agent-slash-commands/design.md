## Context

Music agent currently accepts prompts only via free-text input (`bot.on("message:text")`). Users cannot quick-start generation, check credits without the full `/profile` view, change the AI model themselves, clear a stuck clarification session, or browse past generations. The bot uses grammY with a `Bot<BotContext>` instance, SQLite via `better-sqlite3`, and a modular command pattern (see `shop.ts` `registerShop()`). Commands are registered inline via `bot.command()`.

## Goals / Non-Goals

**Goals:**
- Add `/generate <prompt>` — optionally accepts text to start generation immediately; without args, prompts via follow-up message
- Add `/credits` — lightweight display of remaining credits and subscription status (reuses `getUser`)
- Add `/model [name]` — show current LLM model; with arg, set it (user-level preference, stored per-user in DB)
- Add `/reset` — clear pending clarification session (`clearSession`) and notify user
- Add `/history` — show last N generated playlists (requires new `generations` table)
- Follow existing bot conventions: grammY `bot.command()`, `parse_mode: "HTML"`, emoji helpers, modular `register*` functions
- Register all commands with Telegram via `bot.api.setMyCommands`

**Non-Goals:**
- Mini App changes — commands are Telegram bot only
- Admin-only features — all 5 commands are user-facing
- Complex pagination for `/history` — simple list of last 5-10 entries
- Per-user provider/backend selection — `/model` only switches AI model, not provider or music backend

## Decisions

1. **Modular command files** — each command gets its own file under `server/bot/` (e.g., `generate.ts`, `credits.ts`) exporting a `register*` function, matching the pattern in `shop.ts` and `admin-panel.ts`. Keeps `index.ts` lean and testable.

2. **Per-user model preference** — store in `users` table as `active_model TEXT` column. Defaults to the server's active provider's default model. `getActiveModel(db, chatId)` returns user preference or fallback. Avoids a new table.

3. **Generation history** — new `generations` table: `chat_id`, `prompt`, `playlist_name`, `track_count`, `created_at`. Inserted on successful generation in `run-generation.ts`. `/history` queries last 10.

4. **`/generate` without args** — sends a prompt "Напиши запрос для генерации плейлиста:" and the next user text is treated as the prompt (needs a new session kind `awaiting_generate_prompt` to hook into the text handler). If text is provided inline (`/generate lofi beats`), starts immediately.

5. **`/model` storage key** — reuse the existing `settings` table pattern with key `model:<chatId>`, or add `active_model` column to `users`. Column approach is simpler for lookup.

6. **`bot.api.setMyCommands`** — call during bot setup to show the commands in Telegram's UI. Scope by default (all chats). Descriptions in Russian matching bot locale.

## Risks / Trade-offs

- `/history` requires a DB migration (new table). Existing databases need migration on deploy.
- `/model` per-user storage adds a column to `users`. Zero-downtime migration handled by SQLite `ALTER TABLE` with IF NOT EXISTS guard.
- `/generate` with follow-up prompt needs a new session kind (`awaiting_generate_prompt`), adding complexity to the catch-all text handler.
- `/model` lets users set a model name that may not exist on the active provider — validation needed, or silently fall back to default.
