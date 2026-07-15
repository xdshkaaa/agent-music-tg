## Why

`server/bot/emoji.ts` already implements the full Telegram Premium custom-emoji plumbing (`btnText`, `accent`, `heading`) but `emoji-symbols.json` ships empty and `btnText` is never called from any keyboard builder — so bot buttons and messages still render with plain text/unicode, or no icon at all. A fresh custom-emoji export (`@SOUICdsgn`, 119 IDs with unicode fallbacks) is now available to populate the mapping and wire it into the bot's inline keyboards.

The Mini App intentionally does **not** use emoji (see `emoji-migration` spec — it standardized on Phosphor icons for the "premium utilitarian" look), so this change is scoped to the Telegram bot surfaces only: inline keyboard buttons and `<tg-emoji>` message text.

## What Changes

- Populate `server/bot/emoji-symbols.json` with custom-emoji IDs from the new export, matched by fallback glyph to the symbol names `emoji.ts` already defines (`info`, `gear`, `check`, `profile`, `plus`, `cross`, `warning`, `prohibited`, `key`, `link`, `broadcast`, `stats`, `music`), plus a small set of new symbols needed by existing buttons that have no current symbol (`star`, `calendar`, `trash`, `edit`, `search`, `bell`, `arrow_right`, `arrow_left`, `chat`).
- Relax `loadCustomEmojis` so it no longer requires the IDs to belong to a bot-owned sticker set fetched via `getStickerSet` — switch to validating/loading IDs directly (e.g. via `getCustomEmojiStickers`) since the new export is a personal Unigram emoji pack, not a bot-owned sticker set. **BREAKING** for the `EMOJI_STICKER_SET` env var's meaning (no longer a sticker-set short name requirement for this path).
- Wire `btnText(...)` into the inline keyboard builders that currently pass plain strings: `server/bot/admin-panel.ts`, `server/bot/channel-subscription-gate.ts`, `server/bot/shop.ts` (and `server/bot/index.ts` if it builds keyboards directly) — every button where a matching symbol exists gets its `icon_custom_emoji_id`; buttons with no sensible match keep clean text only.
- Apply `accent()`/`heading()` to the corresponding message headers in the same files where an icon is already implied by the copy (e.g. "⚙️ Настройки", "💎 Магазин").

## Capabilities

### New Capabilities
(none — this extends existing bot behavior, no new capability domain)

### Modified Capabilities
- `emoji-migration`: clarify that the Phosphor-icon requirement applies to `miniapp/src/**/*.tsx` only, and does not conflict with `server/bot/emoji.ts`'s premium custom-emoji usage on the Telegram bot side.

## Impact

- `server/bot/emoji-symbols.json` — populated with real IDs.
- `server/bot/emoji.ts` — `loadCustomEmojis` fetch strategy change.
- `server/bot/admin-panel.ts`, `server/bot/channel-subscription-gate.ts`, `server/bot/shop.ts` — keyboard builders updated to call `btnText`/`accent`.
- `.env.example` / `README.md` — update `EMOJI_STICKER_SET` documentation to reflect the new loading strategy.
- No changes to `miniapp/`.
