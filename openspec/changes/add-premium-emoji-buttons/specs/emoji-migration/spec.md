## MODIFIED Requirements

### Requirement: All emoji replaced with Phosphor icons
Every emoji character in all `.tsx` files under `miniapp/src/` SHALL be replaced with an equivalent Phosphor icon (Bold or Fill weight). This includes error indicators, status badges, decorative elements, and admin panel toggles. This requirement applies only to the Mini App (`miniapp/src/`); it does not apply to `server/bot/` code, which uses Telegram Premium custom emoji (`<tg-emoji>` / `icon_custom_emoji_id`) via `server/bot/emoji.ts` for bot messages and inline keyboard buttons.

Specific replacements:
- `⚠️` → `WarningCircle` (Bold or Fill)
- `💳` → `CreditCard` 
- `🎁` → `Gift`
- `🟢` / `🔴` / `⚪️` → `Circle` (with appropriate color via CSS class)
- `🔑` → `Key`
- `❌` → `X` or `XCircle`
- `➕` / `➖` → `Plus` / `Minus`
- `📅` → `Calendar`
- `🚫` → `Prohibit` or `XCircle`
- `👑` → `Crown`
- `👤` → `User`
- `✎` → `PencilSimple`
- `⭐` (stars) → `Star`

The `IconOrEmoji` component SHALL be updated to prefer Phosphor icons over emoji strings.

#### Scenario: Error messages use WarningCircle icon
- **WHEN** rendering an error alert
- **THEN** `⚠️` SHALL NOT appear in the DOM; `WarningCircle` icon SHALL be used instead

#### Scenario: Admin status indicators use Circle with CSS color
- **WHEN** showing enabled/disabled status
- **THEN** `🟢`/`🔴`/`⚪️` SHALL be replaced with `<Circle size={...} weight="fill" color="var(--accent-green)" />` or similar

#### Scenario: Star icon uses Phosphor Star
- **WHEN** displaying Star price
- **THEN** `⭐` SHALL be replaced with `<Star size={16} weight="fill" color="var(--accent-yellow)" />`

#### Scenario: Decorative emoji in admin panel uses icons
- **WHEN** rendering admin role labels or action icons
- **THEN** `👑`, `👤`, `✎` SHALL be replaced with `Crown`, `User`, `PencilSimple` icons

#### Scenario: Bot-side custom emoji is unaffected
- **WHEN** a bot inline keyboard button or message is built in `server/bot/`
- **THEN** the Phosphor-icon requirement SHALL NOT apply; `btnText`/`accent`/`heading` from `server/bot/emoji.ts` remain the correct mechanism for icons there
