## Context

`server/bot/emoji.ts` was built ahead of having real emoji IDs: it defines `FALLBACK` glyphs for ~24 symbols and exposes `btnText`/`accent`/`heading`, but `symbolToEmojiId` only gets populated if `EMOJI_STICKER_SET` is set to a sticker-set short name the bot can fetch via `getStickerSet`, and no caller anywhere invokes `btnText`. A user-exported Unigram custom-emoji list (`emoji.html`, 119 entries: `custom_emoji_id` + unicode fallback) is now available as the source of real IDs. These IDs come from a personal saved-emoji pack, not a bot-owned sticker set, so `getStickerSet` is the wrong fetch mechanism.

The Mini App (`miniapp/`) deliberately replaced all emoji with Phosphor icons (`emoji-migration` spec) — this change does not touch it.

## Goals / Non-Goals

**Goals:**
- Populate `emoji-symbols.json` with real IDs matched to `emoji.ts`'s existing symbol vocabulary, extended with a few new symbols the bot's keyboards actually need.
- Make `loadCustomEmojis` work with a flat ID list that isn't a bot-owned sticker set.
- Call `btnText`/`accent` from every inline-keyboard builder in `server/bot/` so buttons/messages that have a matching symbol render the premium glyph.

**Non-Goals:**
- No changes to `miniapp/` — it stays Phosphor-only per `emoji-migration`.
- Not building an admin UI to manage the symbol map; it stays a checked-in JSON file.
- Not attempting 1:1 coverage for every symbol — glyphs with no good match in the 119-entry export stay unmapped (clean text, same as today).

## Decisions

**Fetch strategy: `getCustomEmojiStickers(ids)` instead of `getStickerSet(name)`.**
`getCustomEmojiStickers` accepts up to 200 arbitrary `custom_emoji_id`s and returns whichever are still valid/accessible — no ownership or sticker-set membership required. This matches the shape of the data we have (a flat list of IDs) and removes the `EMOJI_STICKER_SET` env var's original meaning. Alternative considered: keep `getStickerSet` and ask the user to publish the export as a bot-owned custom-emoji pack via @Stickers — rejected, adds manual setup with no functional benefit since `getCustomEmojiStickers` needs no pack at all.

**Mapping stays a static checked-in JSON file, keyed by ID → symbol** (unchanged shape from today), populated by hand from `emoji.html`'s fallback glyphs. Alternative considered: auto-derive symbol names from the fallback glyph at load time — rejected, glyph-to-symbol is ambiguous (e.g. `📷` appears 3 times for different IDs) and the bot's call sites need stable, meaningful symbol names (`gear`, `check`), not glyph names.

**Validation on load stays best-effort.** `loadCustomEmojis` calls `getCustomEmojiStickers` once at startup with all IDs referenced in `emoji-symbols.json`; any ID Telegram doesn't return (deleted/invalid) is silently dropped from `symbolToEmojiId`, same graceful-degradation behavior as today (falls back to clean text, never a broken tag).

## Risks / Trade-offs

- [Some symbols have no close-enough fallback glyph in the 119-entry export (`diamond`, `wallet`, `sparkle`, `gift`, `crown`, `headphone`)] → Leave unmapped; `btnText`/`accent` already degrade to clean text with no icon, so no visual break, just no icon on those buttons until a better ID is found.
- [`getCustomEmojiStickers` requires the bot to have "seen" the emoji at least once via a chat it can access, per Bot API quirks in some client versions] → Low risk in practice (IDs come from real Telegram emoji already in wide use); mitigate by keeping the existing catch-all `try/catch` around the fetch so a failure just leaves the map empty, no crash.
- [`EMOJI_STICKER_SET` env var name no longer matches what it does] → Note it in `.env.example`/README as part of this change; keep the var name to avoid an unrelated rename, but repurpose its value to "unused/removed" since IDs are now sourced from `emoji-symbols.json` directly rather than an env-configured sticker set.

## Migration Plan

1. Ship the populated `emoji-symbols.json` and the `getCustomEmojiStickers`-based loader together (loader change is meaningless without real IDs, and vice versa).
2. Deploy; `loadCustomEmojis` runs once at bot startup as today — no data migration needed, no user-facing downtime.
3. Rollback: revert the commit; bot falls back to clean text/no icons exactly as it does today with an empty `emoji-symbols.json`.

## Open Questions

- None — proceeding with the best-effort glyph matching above; a human can tighten individual mappings later by editing `emoji-symbols.json` (no code change needed).
