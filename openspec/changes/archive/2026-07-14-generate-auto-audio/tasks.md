## 1. Auto-audio helper module

- [x] 1.1 Create `server/bot/auto-audio.ts` with `deliverAutoAudio(db, chatId, tracks, api)` function that constructs `AudioSender` from `bot.api`, `YtDlpExtractor`, reads `env.audioScratchDir`, and calls `deliverTrack` for each track sequentially
- [x] 1.2 Add summary message logic (sent/skipped counts) matching existing `summaryText` pattern in `deliver.ts`

## 2. Wire into /generate command

- [x] 2.1 In `server/bot/generate.ts`, import `deliverAutoAudio` and call it after successful generation (line 48), passing `ctx.api` and the playlist tracks

## 3. Wire into free-text handler

- [x] 3.1 In `server/bot/index.ts`, import `deliverAutoAudio` and call it after successful generation in the `PendingGeneratePrompt` path (line 160)
- [x] 3.2 In `server/bot/index.ts`, call `deliverAutoAudio` after successful generation in the direct free-text path (line 194)

## 4. Verification

- [x] 4.1 Run `bun test` and `tsc` to confirm no regressions
- [x] 4.2 Deploy and verify: /generate sends audio messages to chat alongside text reply
