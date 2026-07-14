## 1. Database Migration

- [x] 1.1 Add `generations` table to `server/db.ts` with columns: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `chat_id INTEGER NOT NULL`, `prompt TEXT NOT NULL`, `playlist_name TEXT`, `track_count INTEGER`, `created_at INTEGER DEFAULT (unixepoch())`
- [x] 1.2 Add `active_model TEXT` column to `users` table in `server/db.ts`
- [x] 1.3 Create generation log helper functions (insert + list) in `server/access/generations-store.ts`

## 2. Module Scaffolding

- [x] 2.1 Create `server/bot/generate.ts` with `registerGenerate(bot, db)` function
- [x] 2.2 Create `server/bot/credits.ts` with `registerCredits(bot, db)` function
- [x] 2.3 Create `server/bot/model.ts` with `registerModel(bot, db)` function
- [x] 2.4 Create `server/bot/reset.ts` with `registerReset(bot, db)` function
- [x] 2.5 Create `server/bot/history.ts` with `registerHistory(bot, db)` function

## 3. Command Implementations

- [x] 3.1 Implement `/generate` — parse optional arg, start generation via `startGeneration` or set `awaiting_generate_prompt` session state
- [x] 3.2 Add `awaiting_generate_prompt` session kind to `session.ts` and handle it in the catch-all text handler
- [x] 3.3 Implement `/credits` — show credits count and subscription status using `getUser`, format with emoji helpers
- [x] 3.4 Implement `/model` — show current model, validate and set per-user model preference
- [x] 3.5 Implement `/reset` — call `clearSession` and confirm
- [x] 3.6 Implement `/history` — query last 10 generations, format as text list
- [x] 3.7 Record generation in DB on successful completion in `run-generation.ts`

## 4. Registration & Menu

- [x] 4.1 Register all 5 command modules in `server/bot/index.ts` `createBot()` function
- [x] 4.2 Call `bot.api.setMyCommands` with all commands (including existing ones) to publish command list to Telegram UI
- [x] 4.3 Import new session kind in `session.ts` and catch-all handler

## 5. Verify

- [ ] 5.1 Run `bun run --watch server/index.ts` and test each command in Telegram
- [ ] 5.2 Check that `/history` shows nothing when empty, records on generation
- [ ] 5.3 Check that `/reset` clears a pending clarify session
