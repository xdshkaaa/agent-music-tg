# Group Search: Drop the "Ищу" Status Message — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the "🔎 Ищу..." status message that group search posts and deletes around a cache-miss extraction, replacing it with a typing indicator that stays alive for the whole search+extraction window.

**Architecture:** `performGroupSearch` in `server/bot/group-search.ts` currently sends one `sendChatAction("typing")` ping before search, then (on a cache miss) posts a status reply before extraction and deletes it after delivery. This plan deletes the status-reply/delete pair and replaces the single typing ping with a small interval-based loop (`startTypingLoop`) started right after the rate-limit check and stopped in a `finally` that wraps the rest of the function, so "typing..." stays visible (re-pinged every 4s, under Telegram's ~5s display window) through search, extraction, and delivery regardless of which exit path is taken.

**Tech Stack:** TypeScript, Bun test runner, grammY (Telegram bot framework).

## Global Constraints

- All user-facing text stays in Russian (unaffected here — no new user-facing text).
- Error replies ("Ничего не нашлось", "Не получилось скачать этот трек") are unchanged — only the "Ищу" status message is removed.
- No new production dependencies.

---

### Task 1: Remove the status message, add a persistent typing indicator

**Files:**
- Modify: `server/bot/group-search.ts:118-212` (`performGroupSearch`, plus one new helper function above it)
- Test: `server/bot/group-search.test.ts:276-309` (`describe("cache miss", ...)`)

**Interfaces:**
- Consumes: `ctx.api.sendChatAction(chatId, "typing")` (existing grammY API method, already used at `group-search.ts:124`); `BotContext` type from `./context`.
- Produces: `startTypingLoop(ctx: BotContext, chatId: number): () => void` — a module-scoped helper in `group-search.ts` that fires an immediate typing ping, repeats it every 4000ms, and returns a stop function that clears the interval. Not exported; used only inside `performGroupSearch`.

- [ ] **Step 1: Write the failing test**

Update the existing "cache miss" test to assert the status message is gone. In `server/bot/group-search.test.ts`, replace the two assertions inside `describe("cache miss", ...)` (currently at lines 291-293):

```typescript
    // No "Ищу…" status message is posted or deleted anymore — the typing
    // indicator is the only in-progress signal.
    expect(harness.sentMessages().length).toBe(0);
    expect(harness.deletedMessageIds().length).toBe(0);
```

(This replaces the old block that asserted `.toBe(1)` for both — the comment above it, `// A status message was posted, then cleaned up.`, should be replaced by the new comment shown above.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test server/bot/group-search.test.ts -t "extracts once, caches the result"`
Expected: FAIL — `expect(harness.sentMessages().length).toBe(0)` receives `1` (the status message is still sent by current code).

- [ ] **Step 3: Implement the typing-loop helper and remove the status message**

In `server/bot/group-search.ts`, add this helper immediately above `async function performGroupSearch(`:

```typescript
/**
 * Keeps "typing..." visible in the chat for the duration of a search +
 * extraction, since Telegram only displays it for ~5s per call and there is
 * no status message to fall back on. Call the returned function to stop.
 */
function startTypingLoop(ctx: BotContext, chatId: number): () => void {
  ctx.api.sendChatAction(chatId, "typing").catch(() => {});
  const interval = setInterval(() => {
    ctx.api.sendChatAction(chatId, "typing").catch(() => {});
  }, 4000);
  return () => clearInterval(interval);
}
```

Then replace the full body of `performGroupSearch` (currently `group-search.ts:118-212`) with:

```typescript
async function performGroupSearch(ctx: BotContext, db: AppDb, chatId: number, query: string): Promise<void> {
  if (searchRateLimiter.check(chatId)) return; // silent — a warning in a group is worse than a miss

  const stopTyping = startTypingLoop(ctx, chatId);
  try {
    let tracks: Track[];
    try {
      tracks = await runSearch(db, query);
    } catch (e) {
      console.error("[group search]", e);
      return;
    }

    if (tracks.length === 0) {
      await ctx
        .reply(statusMessage("search", "Ничего не нашлось", `По запросу «${query}» ничего нет.`), {
          parse_mode: "HTML",
          reply_parameters: { message_id: ctx.message!.message_id, allow_sending_without_reply: true },
        })
        .catch(() => {});
      return;
    }

    bumpGroupSearch(db, chatId);
    const top = tracks[0]!;
    const track: DownloadTrack = {
      uri: top.uri,
      title: top.title,
      artist: top.artist,
      durationMs: top.durationMs,
      artwork: top.artwork,
      status: "pending",
    };

    const dedupeKey = `${chatId}:${track.uri}`;
    const existing = inFlight.get(dedupeKey);
    if (existing) {
      // Someone already asked for this exact track and it's still being
      // fetched — the send in flight will reach the whole chat, no need for a
      // second extraction.
      await existing;
      return;
    }

    const cached = getCachedAudio(db, track.uri);
    const replyToMessageId = ctx.message!.message_id;

    const run = (async () => {
      if (!cached && groupExtractRateLimiter.check(chatId)) return; // extraction pool is shared with paying users elsewhere

      try {
        const deps: DeliverDeps = deliverDepsOverride ?? {
          sender: createTelegramAudioSender(ctx.api),
          extractor: new YtDlpExtractor(),
          scratchDir: env.audioScratchDir,
        };
        await deliverTrack(db, chatId, track, deps, { replyToMessageId, caption: trackCaption(ctx.me.username) });
        bumpGroupTrack(db, chatId);
      } catch (e) {
        console.error(`group search delivery failed for ${track.uri} in chat ${chatId}:`, e);
        await ctx
          .reply(statusMessage("cross", "Не получилось скачать этот трек"), {
            parse_mode: "HTML",
            reply_parameters: { message_id: replyToMessageId, allow_sending_without_reply: true },
          })
          .catch(() => {});
      }
    })();

    inFlight.set(dedupeKey, run);
    try {
      await run;
    } finally {
      inFlight.delete(dedupeKey);
    }
  } finally {
    stopTyping();
  }
}
```

This removes the `ctx.reply("🔎 Ищу...")` call, the `statusMessageId` tracking, and the `deleteMessage` cleanup — everything else (search, dedupe, cache check, delivery, error replies, rate limiting) is unchanged, just re-indented under the new `try`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test server/bot/group-search.test.ts`
Expected: PASS — all tests in the file, including the updated "cache miss" test and the untouched "cache hit" / concurrent-request / rate-limiter tests (which already asserted zero or one status messages and are unaffected by this change).

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add server/bot/group-search.ts server/bot/group-search.test.ts
git commit -m "$(cat <<'EOF'
fix(bot): drop the "Ищу" status message from group search

Rely on a persistent typing indicator instead of posting-then-deleting
a status reply around cache-miss extractions.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
