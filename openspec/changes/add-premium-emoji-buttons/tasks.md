## 1. Emoji ID mapping

- [x] 1.1 Parse `/Users/xdshka/Downloads/emoji.html` into a flat `custom_emoji_id → fallback glyph` list (119 entries).
- [x] 1.2 Match existing `emoji.ts` symbols to IDs by fallback-glyph meaning: `info`, `gear`, `check`, `profile`, `plus`, `cross`, `warning`, `prohibited`, `key`, `link`, `broadcast`, `stats`, `music`. Leave symbols with no good match (`diamond`, `wallet`, `sparkle`, `gift`, `crown`, `headphone`) unmapped.
- [x] 1.3 Add new symbols needed by `admin-panel.ts`/`shop.ts` call sites currently reusing generic symbols: `star` (for pricing/Stars), `trash` (delete actions currently on `package`/`danger`), `back` (for "Назад" buttons currently on `gear`), `search`, `bell`.
- [x] 1.4 Write the final `custom_emoji_id: symbol` entries into `server/bot/emoji-symbols.json`, keeping the existing `_comment`/`_format`/`_example` keys.

## 2. Loader fix

- [x] 2.1 In `server/bot/emoji.ts`, replace the `getStickerSet(setName)` call in `loadCustomEmojis` with `bot.api.getCustomEmojiStickers(ids)` where `ids` is every ID listed in `emoji-symbols.json`.
- [x] 2.2 Keep the existing `try/catch` graceful-degradation behavior: any ID Telegram doesn't return stays out of `symbolToEmojiId` (clean text fallback, no crash).
- [x] 2.3 Update the function's doc comment to describe the new loading strategy (no longer requires a bot-owned sticker set).
- [x] 2.4 Update `server/bot/emoji.test.ts` to mock `getCustomEmojiStickers` instead of `getStickerSet`.

## 3. Call-site touch-ups

- [x] 3.1 In `server/bot/admin-panel.ts`, swap the "Назад" buttons' symbol from `"gear"` to `"back"` (or drop the symbol if unmapped) so it doesn't visually collide with actual settings buttons.
- [x] 3.2 Swap delete/remove buttons currently tagged `"package"` (with `"danger"` style) to `"trash"` where a `trash` ID was mapped in 1.3.
- [x] 3.3 In `server/bot/shop.ts`, tag the plain-text "Оплатить" and "Криптой — ..." buttons (currently built without `btnText`) with the matching symbol if a good ID exists, or leave as clean text if not.
- [x] 3.4 Apply `heading()`/`accent()` to the admin menu and shop message headers that already imply an icon in their copy (e.g. settings, shop).

## 4. Docs & config

- [x] 4.1 Update `.env.example` and `README.md` to describe `EMOJI_STICKER_SET`'s revised meaning (or mark it unused if IDs are now sourced entirely from `emoji-symbols.json`).

## 5. Verification

- [x] 5.1 `bun test server/bot/emoji.test.ts`
- [x] 5.2 `bun run typecheck`
- [ ] 5.3 Manually trigger `/admin` and `/buy` against a real bot token to confirm buttons render premium glyphs (or clean text where unmapped) with no broken tags.
