## ADDED Requirements

### Requirement: Optional premium-emoji resolver module
The bot SHALL expose a `server/bot/emoji.ts` module that, when the `EMOJI_STICKER_SET` environment variable is set, fetches the named Telegram custom-emoji sticker set once at startup and builds a `symbol → custom_emoji_id` map by reading a convention file `server/bot/emoji-symbols.json` that maps `custom_emoji_id` to symbolic names. The map SHALL be cached for the process lifetime.

#### Scenario: Map loads once at startup when env is set
- **WHEN** the bot process starts and `EMOJI_STICKER_SET` is set to a non-empty value
- **THEN** the module calls `bot.api.getStickerSet(env.emojiStickerSet)` exactly once
- **AND** builds a `symbol → custom_emoji_id` map from stickers whose `custom_emoji_id` appears in `emoji-symbols.json`
- **AND** subsequent calls to `btnText` or `accent` reuse the cached map with no further Telegram API calls

#### Scenario: Module degrades gracefully when env is unset
- **WHEN** the bot process starts and `EMOJI_STICKER_SET` is unset or empty
- **THEN** the module builds no custom-emoji map
- **AND** `btnText` returns a clean-text button object with no `icon_custom_emoji_id`
- **AND** `accent` returns the empty string
- **AND** no Telegram API call is made for the sticker set

### Requirement: Inline button object with icon_custom_emoji_id
The `btnText(label, symbol, style?)` helper SHALL return an object `{ text: label, icon_custom_emoji_id?, style? }` suitable as the first argument to grammy's `InlineKeyboard.text/webApp/url`. When `symbol` is mapped, `icon_custom_emoji_id` SHALL be set so Telegram renders the bot's custom-emoji glyph before the label. When unmapped, the object SHALL carry clean text only (`{ text: label }`) — no bare unicode emoji is prepended to the label. An optional `style` (`"danger" | "success" | "primary"`) MAY be passed to color the button (e.g. for active/inactive state), superseding status-flag emoji.

#### Scenario: btnText carries icon_custom_emoji_id when mapped
- **WHEN** `btnText("Открыть приложение", "sparkle")` is called and `"sparkle"` has an entry in the custom-emoji map
- **THEN** the returned object is `{ text: "Открыть приложение", icon_custom_emoji_id: "<ID>" }`

#### Scenario: btnText returns clean text when unmapped
- **WHEN** `btnText("Статистика", "stats")` is called and `"stats"` has no entry in the map (because `EMOJI_STICKER_SET` is unset or the sticker set lacks a `stats` mapping)
- **THEN** the returned object is `{ text: "Статистика" }` with no `icon_custom_emoji_id` and no unicode prefix

### Requirement: Text emphasis with tg-emoji HTML tags or empty
The `accent(symbol)` helper SHALL return a `<tg-emoji emoji-id="ID">fallback</tg-emoji>` HTML tag wrapping the matching unicode fallback glyph (Telegram replaces it with the sticker image at render time), for use inside bot message bodies parsed with `parse_mode: "HTML"`. When `symbol` is unmapped, it SHALL return the empty string — no bare unicode is shipped in message text. A `heading(symbol, text)` convenience helper SHALL compose `${accent(symbol) ? accent(symbol) + " " + text : text}` for use in headings.

#### Scenario: Accent returns a tg-emoji tag when mapped
- **WHEN** `accent("info")` is called and `"info"` has an entry in the custom-emoji map
- **THEN** the returned string is a valid `<tg-emoji emoji-id="<ID>">ℹ️</tg-emoji>` HTML tag

#### Scenario: Accent returns empty string when unmapped
- **WHEN** `accent("info")` is called and `"info"` has no mapping
- **THEN** the returned string is `""` (empty — no bare unicode in message text)

#### Scenario: Heading prefixes the text only when mapped
- **WHEN** `heading("info", "AGENT MUSIC")` is called
- **THEN** if `"info"` is mapped the result is `<tg-emoji emoji-id="<ID>">ℹ️</tg-emoji> AGENT MUSIC`
- **AND** if `"info"` is unmapped the result is the bare text `AGENT MUSIC`

### Requirement: Static unicode fallback table
The module SHALL export a static per-symbol unicode fallback table covering at least the symbols used by the bot UI: `info`, `diamond`, `music`, `stats`, `package`, `broadcast`, `gear`, `check`, `profile`, `wallet`, `plus`, `ruler`, `sparkle`. These glyphs are used ONLY as the inner visible text of `<tg-emoji>` tags (never as bare text in messages or buttons).

#### Scenario: Every used symbol has a fallback
- **WHEN** `fallbackSymbol(s)` is called for any `s` in the set of symbols used by the bot (`info`, `diamond`, `music`, `stats`, `package`, `broadcast`, `gear`, `check`, `profile`, `wallet`, `plus`, `ruler`, `sparkle`)
- **THEN** the function returns a non-empty string unicode emoji
- **AND** the function never throws for any of these symbols

### Requirement: Optional env var with zero hard dependency
The bot SHALL read the optional `EMOJI_STICKER_SET` environment variable via `server/env.ts` and SHALL enumerate it in `.env.example` with a comment stating that omitting the variable triggers clean-text fallback (no emoji) and has no adverse effect.

#### Scenario: Env var is optional and documented
- **WHEN** a new clone is set up from `.env.example`
- **THEN** the file contains an `EMOJI_STICKER_SET=` line with a comment explaining that it is optional
- **AND** the default value in `server/env.ts` is the empty string
- **AND** the bot starts successfully and serves all commands without `EMOJI_STICKER_SET` set
