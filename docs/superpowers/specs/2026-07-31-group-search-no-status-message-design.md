# Group search: drop the "Ищу" status message — design

## Summary

Group keyword search (`server/bot/group-search.ts`) currently posts a "🔎
Ищу..." reply when a requested track isn't in `audio_cache`, then deletes it
once the track is delivered. This change removes that message entirely,
relying on Telegram's "typing..." chat action as the only in-progress signal.

## Scope

In: `performGroupSearch` in `server/bot/group-search.ts`, its test coverage in
`server/bot/group-search.test.ts`.

Out: caching, rate limiting, the "ничего не нашлось" / "не получилось
скачать" error replies, `deliverTrack`, anything in the private-chat
(`/search`) flow — none of that changes.

## Design

1. **Remove the status message.** Delete the `ctx.reply("🔎 Ищу...")` call
   (currently posted only on a cache miss, right before extraction starts)
   and the matching `deleteMessage` cleanup that runs once delivery finishes.
   Cache hits already send no status message — after this change, neither
   path does.

2. **Keep the typing indicator alive for the whole operation.** Today
   `sendChatAction(chatId, "typing")` fires once, before `runSearch` even
   runs. Telegram only shows "typing..." for ~5 seconds per call, and a cold
   catalog search plus a yt-dlp extraction can both take longer than that
   individually — a single ping is not reliable cover for removing the status
   message. Replace it with a repeating ping (every 4s, safely under
   Telegram's ~5s window) that:
   - starts right after the `searchRateLimiter` check passes (same point the
     single ping starts today)
   - stops in a `finally` when the whole `performGroupSearch` call resolves
     (cache hit delivered, cache miss extracted and delivered, extraction
     rate-limited, delivery failed, or any thrown error)

3. **Tests.** Update the "cache miss" test in `group-search.test.ts`: it
   currently asserts `harness.sentMessages().length` is `1` (the status
   message) and `harness.deletedMessageIds().length` is `1` (its cleanup);
   both become `0`. No other test touches the status message.

## Error handling

Unchanged: the "ничего не нашлось" reply (no search results) and "не
получилось скачать этот трек" reply (delivery failure) both stay as
dedicated `ctx.reply` calls — they carry information the typing indicator
can't convey and were never part of the removed status-message flow.
