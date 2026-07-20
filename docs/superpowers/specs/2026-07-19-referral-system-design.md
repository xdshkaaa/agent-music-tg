# Referral system — design

## Summary

Users invite others via a personal Telegram deep link. When an invitee starts
the bot through that link, the inviter is credited generation credits
(admin-configurable amount, optional cap on total referrals). Available both
as a bot command (`/referral`) and a Mini App card in the Profile tab, each
with inline/share buttons.

## Data model (migration v11)

```sql
ALTER TABLE users ADD COLUMN referred_by INTEGER; -- chat_id of inviter, set once, NULL if none

CREATE TABLE referral_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_chat_id INTEGER NOT NULL,
  referred_chat_id INTEGER NOT NULL UNIQUE, -- one event per invitee, dedupes double-credit
  credits_granted INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_referral_events_referrer ON referral_events(referrer_chat_id);
```

Settings (via existing `settings` key/value table, `lib/settings.ts` pattern):
- `referral_reward_credits` (default 1)
- `referral_max_per_user` (default 0 = unlimited)

## Bot side (`server/bot/referral.ts`, new file)

- `bot.command("start", ...)` in `server/bot/index.ts` already exists — grammy
  exposes the payload after `/start` as `ctx.match`. Extend it: if
  `ctx.match` matches `/^ref_(\d+)$/`, call `applyReferral(db, referrerChatId, ctx.chat.id)`
  **before** `buildMenuView` — reuses the existing `upsertUser` call already
  on that line so the invitee row exists first.
- `applyReferral(db, referrerChatId, referredChatId)`:
  - no-op if `referrerChatId === referredChatId`
  - no-op if referrer doesn't exist in `users`
  - no-op if `referred_chat_id` already has a `referral_events` row (dedupe;
    also guards re-triggering on every subsequent `/start ref_...` reuse)
  - no-op if `referral_max_per_user` cap reached for this referrer (count via
    `referral_events` rows for that referrer)
  - else: set `users.referred_by`, insert `referral_events` row, `addCredits`
    (existing `access/users-store.ts` fn) to referrer, best-effort DM the
    referrer ("Новый реферал! +N генераций").
- New `bot.command("referral", ...)`: sends link
  `https://t.me/<botUsername>?start=ref_<chatId>`, invited count (`COUNT(*) FROM referral_events WHERE referrer_chat_id = ?`),
  credits earned (`SUM(credits_granted)`), and an inline `url` button using
  Telegram's share deep link (`https://t.me/share/url?url=<link>`) — no bot
  API call needed, works as a plain `InlineKeyboard.url`.
- Add a "Реферальная программа" entry to `buildStartKeyboard` (nav row) and to
  `/profile`'s view, both linking to the same `/referral` flow via
  `nav:referral` callback (pattern matches `nav:buy` / `nav:profile` already
  in `shop.ts`/`index.ts`).
- `<botUsername>` resolved once at startup via `bot.api.getMe()` (grammy
  caches this internally after `bot.init()`; expose via `bot.botInfo.username`).

## Server API (`server/api/referral-routes.ts`, new file)

Mounted under existing initData-authenticated router (same pattern as
`me-routes.ts` / `playlist-routes.ts`).

- `GET /api/referral` → `{ link, invitedCount, creditsEarned, rewardCredits, maxPerUser }`
  for the authenticated chat.

Admin (extend `admin-routes.ts`):
- `GET /admin/referral-settings` → `{ rewardCredits, maxPerUser }`
- `PUT /admin/referral-settings` → body `{ rewardCredits?, maxPerUser? }`,
  validated non-negative integers, same `requireAdmin` gate.

## Store (`server/access/referral-store.ts`, new file)

Mirrors `users-store.ts` conventions:
- `applyReferral(db, referrerChatId, referredChatId): boolean` (the logic above)
- `getReferralStats(db, chatId): { invitedCount, creditsEarned }`
- `getReferralSettings(db): { rewardCredits, maxPerUser }` / `setReferralSettings(db, patch)` in `lib/settings.ts` (follows `getShopSettings`/`setShopSettings` pattern)

## Miniapp (ProfileScreen.tsx)

New card in the existing Profile tab (below stats grid, existing pattern —
similar visual weight to the credits/subscription rows already there):
- Referral link display + "Копировать" button (`navigator.clipboard`)
- "Пригласить друга" button → `Telegram.WebApp.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(link))`
- Invited count / credits earned, fetched from `GET /api/referral`

No new screen/route — reuses `ProfileScreen`'s existing data-fetch pattern
(likely a `useEffect` + fetch call already present for profile data; extend
with a second fetch or fold into an existing combined `/api/me`-style call if
one exists — implementer to check at build time).

## Out of scope

- Anti-abuse beyond invitee dedupe (per earlier decision — no allowlist gate,
  no fresh-account heuristics)
- Referral tiers / multi-level referrals
- Admin UI to view individual referral event history (stats endpoint returns
  aggregate only; can be added later via `getAllGrantHistory`-style listing if needed)
- Automated nurture and win-back messages. Their audiences, triggers, limits,
  and stop conditions are defined separately in
  [Дожим и возврат пользователей](./2026-07-20-lifecycle-messaging-design.md).
