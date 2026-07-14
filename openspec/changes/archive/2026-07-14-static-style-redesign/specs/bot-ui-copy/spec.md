## ADDED Requirements

### Requirement: Uppercase purple-glyph headings on bot commands
The bot's `/start`, `/app`, `/about`, `/buy`, and `/profile` reply text SHALL be prefixed with a purple-glyph heading composed via the `heading` helper (`heading(symbol, text)`) so command replies share a STATICA-style uppercase visual identity, while preserving the existing command arguments, keyboards, and callback behavior. Replies SHALL be sent with `parse_mode: "HTML"` so any `<tg-emoji>` tags render correctly; when no premium-emoji mapping exists, the heading falls back to clean text (no bare unicode).

#### Scenario: /start reply renders an AGENT MUSIC heading
- **WHEN** a user invokes `/start`
- **THEN** the reply text contains `<b>heading("info", "AGENT MUSIC")</b>` as its first line
- **AND** the reply lists three short bullets (Сгенерируй плейлист / Купи доступ / Поддержка 24/7) before the shop's `aboutText`
- **AND** the existing `InlineKeyboard().webApp(btnText("Открыть приложение", "sparkle"), env.publicOrigin)` keyboard is attached unchanged
- **AND** the reply is sent with `parse_mode: "HTML"`

#### Scenario: /profile reply renders a ПРОФИЛЬ heading
- **WHEN** a user invokes `/profile`
- **THEN** the reply begins with `<b>heading("profile", "ПРОФИЛЬ ─")</b>` on its own line
- **AND** the credits / subscription / purchases lines use `accent("wallet")` / `accent("ruler")` / `accent("package")` glyphs when mapped, or clean text when unmapped
- **AND** the data values shown are identical to the current `/profile` implementation

### Requirement: Premium-glyph icons on inline keyboard labels
The shop offers keyboard and the admin menu keyboard SHALL pass each button label through `btnText(label, symbol)` so the bot's custom-emoji glyph renders via the `icon_custom_emoji_id` field, preserving the existing callback-data strings (`buy:<id>` for offers, `admin:*` for the admin menu) unchanged.

#### Scenario: Offers keyboard rows receive an icon_custom_emoji_id when mapped
- **WHEN** `/buy` is invoked and at least one active offer exists
- **THEN** each inline-keyboard row is built via `btnText(offerLabel(o), o.grantKind === "subscription" ? "ruler" : "music")`
- **AND** when the symbol is mapped the button object carries `icon_custom_emoji_id`; when unmapped it carries clean text
- **AND** each row's callback data remains exactly `buy:<offerId>` — no change to the string format

#### Scenario: Admin menu rows receive an icon_custom_emoji_id when mapped
- **WHEN** an admin invokes `/admin`
- **THEN** the four menu rows are each built via `btnText` with their respective symbol (`stats`, `package`, `broadcast`, `gear`)
- **AND** each row's callback data remains exactly `admin:stats`, `admin:offers`, `admin:broadcast`, `admin:settings` (respectively)

### Requirement: Offer state conveyed via style, not status-flag emoji
The admin offer list SHALL convey each offer's active/inactive state via the button `style` field (`"success"` for active, `"danger"` for inactive, `"danger"` for the delete button), not via status-flag unicode emoji (✅/🚫) in the button label. Button text SHALL stay clean per the telegram-premium-emoji skill.

#### Scenario: Offer toggle button is colored by state
- **WHEN** an admin opens the offer list via `admin:offers`
- **THEN** each offer toggle button is built via `btnText(label, "package", o.active ? "success" : "danger")`
- **AND** the delete button is built via `btnText("Удалить", "package", "danger")`
- **AND** neither button's `text` contains a `✅` / `🚫` / `🗑` unicode status flag

### Requirement: Callback answers use plain text only
Callback-query confirmations emitted via `ctx.answerCallbackQuery({ text })` SHALL use plain text only, because the Telegram `answerCallbackQuery` text payload ignores HTML / `<tg-emoji>` / `custom_emoji_id` formatting. The call site SHALL carry a one-line comment documenting this.

#### Scenario: Admin toggles show a plain-text status word only
- **WHEN** an admin toggles an offer's active state via the `admin:offer:toggle:<id>` callback
- **THEN** the `answerCallbackQuery` text is a plain status word (`Выключен` / `Включён` / `Не найден`) with no `<tg-emoji>` tag, no `custom_emoji_id`, and no bare unicode emoji
- **AND** the call site carries a comment stating that `answerCallbackQuery.text` does not support HTML / custom emoji

### Requirement: Shop prompt text is restyled without changing its meaning
The `purchasePromptText()` helper SHALL return the shop greeting text composed of `<b>heading("ruler", "ДОСТУП ────")</b>` followed by the same call-to-action meaning ("select a package to access generation"), and SHALL render correctly under `parse_mode: "HTML"`.

#### Scenario: Shop prompt renders the new header
- **WHEN** `sendOffers` is called from the no-access path or `/buy`
- **THEN** the header text begins with `<b>heading("ruler", "ДОСТУП ────")</b>`
- **AND** the existing offers keyboard is attached unchanged
- **AND** the reply is sent with `parse_mode: "HTML"`

### Requirement: Settings related commands unchanged
The `/provider` and `/backend` admin commands, all `message:text`/clarify-generation flows, the allowlist gate middleware, the session FSM, and the callback schemas in `server/bot/admin-panel.ts` beyond the visible menu label composition SHALL not change as a side effect of the redesign.

#### Scenario: Provider and backend commands are untouched
- **WHEN** an admin invokes `/provider` or `/backend`
- **THEN** the command's reply text is identical to the previous implementation (no purple glyph, no `<tg-emoji>` tag, no format change)
- **AND** the active-provider/backend setter behavior is unchanged

#### Scenario: Admin-panel multi-step text FSM is untouched
- **WHEN** an admin enters the add-offer / broadcast / shop-settings flow via callbacks
- **THEN** the `handleAdminText` FSM in `server/bot/admin-panel.ts` consumes subsequent free-text messages unchanged
- **AND** the `admin:addoffer` / `admin:broadcast` / `admin:set:<field>` callback data strings remain byte-identical to the previous implementation
