# Mini App subscription gate — design

## Summary

The bot already has a mandatory channel-subscription gate
(`server/bot/channel-subscription-gate.ts`, admin-managed via the «Каналы»
panel): a chat that hasn't joined every required channel gets a blocking
message with subscribe buttons instead of normal bot behavior. That gate only
runs in the grammY middleware chain, so it never sees Mini App API calls —
opening the Mini App directly bypasses it entirely. This change closes that
gap, fixes a cache bug that makes the recheck button unreliable, and updates
the recheck button's label.

Goal: the subscription requirement holds for both entry points to the
product, not just the bot chat.

## Scope

In: extending the existing gate to `/api/*`, a shared membership-check module
used by both the bot and the API, a forced-recheck fix, a Mini App gate
screen, one wording change.

Out: changing how required channels are configured (admin panel, unchanged),
changing the bot-side message copy (unchanged per stakeholder decision), any
new channels — channel configuration is a runtime admin-panel action taken
after this ships, not part of this change.

## Bug found during investigation: recheck doesn't recheck

`checkChannelMembership` (`channel-subscription-gate.ts:46-78`) always returns
the cached `channel_memberships` row if it is under 300s old, with no way to
bypass that cache. The bot's own «Я вступился» button calls this same
function through `checkAllMemberships`. Sequence that breaks today:

1. User sends `/start` → gate checks live, caches "not a member", shows the
   gate message.
2. User taps a subscribe link, joins the channel, returns, taps the recheck
   button — within the same 300s window.
3. The check reads the fresh-but-stale cache entry from step 1 and reports
   "not a member" again, even though the user is now subscribed.

The button only works correctly if the user waits out the TTL. Fix: extract
the check into a shared module with a `force` parameter. Passive checks (every
incoming update) keep using the TTL cache, unchanged. Manual recheck actions —
the bot's button and the new Mini App one — always query Telegram live and
write the fresh result back to the cache.

## Shared module: `server/access/subscription-check.ts` (new file)

```ts
export interface MembershipCheckDeps {
  getChatMember: (channelId: number, chatId: number) => Promise<{ status: string }>;
}

export async function checkChannelMembership(
  db: AppDb,
  deps: MembershipCheckDeps,
  channel: RequiredChannel,
  chatId: number,
  force: boolean,
): Promise<boolean> { ... }  // moved from channel-subscription-gate.ts, + force param

export async function checkAllMemberships(
  db: AppDb,
  deps: MembershipCheckDeps,
  channels: RequiredChannel[],
  chatId: number,
  force: boolean,
): Promise<boolean> { ... }  // moved, unchanged logic otherwise
```

`MembershipCheckDeps` is a narrow function type, not grammY's `Api` — the same
shape as the existing `ApiDeps.send` / `ApiDeps.createStarsInvoiceLink`
functions — so it's trivially mockable in tests and doesn't pull grammY types
into the API layer.

`channel-subscription-gate.ts` is updated to call this module (`ctx.api` as
the `getChatMember` dep, `force: false` for the passive per-message check,
`force: true` for the `subgate:check` callback), dropping its own copies of
`checkChannelMembership`/`checkAllMemberships`. No behavior change on the bot
side except the bug fix.

## Mini App API gate

`server/api/context.ts` — `ApiDeps` gains:

```ts
/** Checks channel membership; enables the Mini App subscription gate. Absent in tests that don't exercise it. */
getChatMember?: (channelId: number, chatId: number) => Promise<{ status: string }>;
```

`server/index.ts` wires it: `getChatMember: (channelId, chatId) => bot.api.getChatMember(channelId, chatId)`.

`server/api/middleware.ts` — new `requireSubscription(db, deps)`:

- Skips (calls `next()`) if `c.get("isAdmin")`, if `isSubscriptionGateEnabled(db)`
  is false, if `listRequiredChannels(db)` is empty, or if `deps.getChatMember`
  is absent (fail-open, matching how other optional deps behave when unwired).
- Otherwise calls `checkAllMemberships(db, deps, channels, chatId, force: false)`
  (TTL-cached — this runs on every gated request, so it must not hammer
  Telegram).
- On failure: `403 { error: "subscription_required", channels: [{ title, username, inviteLink }] }`.

`server/api/routes.ts` — mounted right after the existing auth gate, with the
recheck route registered first so it isn't blocked by the gate it exists to
clear (same pattern already used for the unlisted share route at line 60):

```ts
app.use("*", requireAuth(db));
app.use("*", recordCaller);

app.route("/", createSubscriptionRoutes(db, deps));   // POST /subscription/recheck
app.use("*", requireSubscription(db, deps));           // gates everything registered below

app.route("/", createShareRoutes(db));
... (existing routes, unchanged)
```

`server/api/subscription-routes.ts` (new file) — `POST /api/subscription/recheck`:
calls `checkAllMemberships(db, deps, channels, chatId, force: true)` per
channel and returns `{ ok: boolean, channels: [{ channelId, title, username, inviteLink, isMember }] }`.
Requires `requireAuth` (real chat identity) but is exempt from
`requireSubscription` by registration order above.

The unlisted share route (`GET /api/shares/:token`, mounted before
`requireAuth` entirely) is untouched — it stays the one route open to callers
who aren't on the allowlist at all, and the subscription gate doesn't apply to
it either, consistent with the existing exemption.

## Mini App frontend

`miniapp/src/lib/api.ts`:

- `SubscriptionRequiredError` (mirrors the existing `PlaylistLimitReachedError`
  at `lib/api.ts:365-372`), carrying `channels` from the 403 body. `request()`
  throws it when `error === "subscription_required"`.
- `api.recheckSubscription()` → `POST /api/subscription/recheck`, returns the
  parsed `{ ok, channels }`.

`miniapp/src/App.tsx`: the bootstrap call `api.me().then(setMe).catch(() => {})`
(`App.tsx:150`) currently swallows every error silently. It's updated to catch
`SubscriptionRequiredError` specifically, store its `channels` in a new
`subscriptionGate` state, and render `SubscriptionGate` in place of the normal
app when set. Other errors from this call keep today's swallow-and-retry-later
behavior — unchanged, out of scope here.

`miniapp/src/components/SubscriptionGate.tsx` (new):

- Renders the channel list with subscribe buttons, using the existing
  `openTelegramLink`/`openLink` fallback pattern from `lib/telegram.ts`
  (`openPayUrl`, `openSupport`) rather than introducing a new one.
- A **«Я вступил»** button calls `api.recheckSubscription()`. On `ok: true`,
  clears `subscriptionGate` and re-runs the `App.tsx` bootstrap. On `ok: false`,
  shows an inline "not all subscriptions confirmed" line, mirroring the bot's
  callback-answer text, without leaving the screen.
- No polling, no auto-recheck — matches the bot's tap-to-check UX.

Mid-session unsubscribe (a user leaves a channel while already inside the Mini
App) is not actively detected — only the initial bootstrap call is checked.
This matches the bot's own behavior, which also only re-gates on the next
incoming update, and is accepted as out of scope here (YAGNI: no existing
precedent in this codebase for reactive re-auth mid-session).

## Wording change

Button label only, three call sites in `channel-subscription-gate.ts` (42,
107, 132: the keyboard button and both message strings that reference it by
name) and the new `SubscriptionGate.tsx`: «Я вступился» → «Я вступил». Rest of
the bot's message copy (🚫 Доступ ограничен, channel list format, success
message) is unchanged.

## Testing

`subscription-check.test.ts` (new, replaces bug-relevant coverage that would
otherwise live in the bot gate's tests):
- passive check (`force: false`) within TTL returns the cached value without
  calling `getChatMember`
- forced check (`force: true`) always calls `getChatMember`, even with a fresh
  cache entry, and overwrites the cache with the new result
- a 429 from Telegram falls back to the cached value if one exists, otherwise
  reports not-a-member (existing behavior, preserved)

`server/api/middleware.test.ts` (extends existing coverage):
- gate disabled or no required channels → request passes through
- admin chat → request passes through regardless of membership
- non-member, gate enabled → 403 `subscription_required` with channel list
- `getChatMember` dep absent → request passes through (fail-open)

`subscription-routes.test.ts` (new):
- recheck reflects a membership change immediately (proves `force: true` is
  actually wired, not just unit-tested in isolation)
- recheck route itself is reachable while gated (proves the mount-order
  exemption works, not just the unit logic)

Mini App: manual verification (per project convention — no browser test
harness for this repo) — trigger a 403 from a test allowlisted+non-subscribed
chat, confirm `SubscriptionGate` renders, confirm the recheck button clears
the gate after joining the test channel.
