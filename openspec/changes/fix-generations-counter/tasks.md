## 1. Record resumed generations

- [x] 1.1 In `server/core/run-generation.ts`, add `insertGeneration` call inside `resumeGeneration` on `outcome.status === "ok"`, passing `chatId`, `originalPrompt`, `outcome.playlist.name`, and `outcome.playlist.tracks.length` (mirror `startGeneration`).
- [x] 1.2 Add `countGenerations(db, chatId): number` to `server/access/generations-store.ts` using `SELECT COUNT(*) FROM generations WHERE chat_id = ?`.

## 2. Expose generations-used to clients

- [x] 2.1 Add `generationsUsed: number` to `MeResponse` in `miniapp/src/lib/api.ts`.
- [x] 2.2 In `server/api/routes.ts` `/me` handler, include `generationsUsed: countGenerations(db, c.get("chatId"))`.
- [x] 2.3 In `server/bot/credits.ts`, append the spent generations total to the `/credits` reply (e.g. «Потрачено: N ген»).

## 3. Show spent counter in Mini App

- [x] 3.1 In `miniapp/src/screens/ProfileScreen.tsx`, render «Потрачено: N ген» in the account block beneath the balance using `me.generationsUsed`.

## 4. Verification

- [x] 4.1 Run `bun run typecheck` and `bun test` to confirm no regressions (pre-existing failures in openspec test harness and admin-panel.ts are unrelated; my changed files typecheck and all feature tests pass).
- [ ] 4.2 Manually verify a clarification/resume generation now appears in `/history` and increments the spent count in Profile and `/credits`. (Requires live Telegram/bot; pending operator check.)
