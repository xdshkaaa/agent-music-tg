## ADDED Requirements

### Requirement: Top bar with logo chip and credits pill
The Mini App SHALL render a sticky top bar containing the `agent music` wordmark and ring-glyph logo chip on the left and a wallet pill on the right that shows the user's current generation-credit balance with a Phosphor Wallet icon, replacing the previous row of top glass toggle buttons.

#### Scenario: Top bar shows the wordmark and credit balance
- **WHEN** the Mini App mounts
- **THEN** a sticky header renders the `agent music` logo chip on the left
- **AND** a wallet pill on the right displays the `me.credits` value (formatted as `<n> ген`) prefixed by a Phosphor `Wallet` icon
- **AND** the previous `nav-row` of top glass toggle buttons is no longer present

### Requirement: Floating bottom dock with three tabs plus admin-only fourth
The Mini App SHALL replace top-of-page navigation with a floating bottom dock containing exactly three visible tabs (`Создать`, `Магазин`, `Профиль`) for all users, plus a fourth `Админ` tab visible only when `api.me().isAdmin` is true. Each tab routes to its corresponding screen with no behavior change.

#### Scenario: All users see three tabs
- **WHEN** any user opens the Mini App
- **THEN** the bottom dock shows the tabs `Создать` (`Sparkle` icon), `Магазин` (`Storefront` icon), and `Профиль` (`User` icon)
- **AND** the dock is pinned to the bottom of the viewport
- **AND** tapping a tab navigates to the corresponding screen kind

#### Scenario: Admins see a fourth tab
- **WHEN** `api.me().isAdmin` returns true
- **THEN** the bottom dock additionally shows the `Админ` (`Shield` icon) tab
- **AND** tapping `Админ` navigates to the admin screen kind

#### Scenario: The active tab reflects the current screen
- **WHEN** the active screen kind is `prompt`, `clarify`, or `results`
- **THEN** the `Создать` tab is highlighted with a lightened pill surface and a purple-tinted icon
- **AND** no other tab is highlighted

### Requirement: Settings screen folds under Admin
The previously top-level `Настройки` (AI provider / music backend) screen SHALL no longer be a separate dock tab; it SHALL render as a stacked card inside the `Админ` screen while remaining lazy-loaded as its own React component.

#### Scenario: Settings reachable only via Admin
- **WHEN** an admin taps `Админ`
- **THEN** the admin screen renders with the existing stats / offers / broadcast / shop-settings cards plus the previously top-level Settings (provider/backend) content as an additional stacked card
- **AND** no `Настройки` tab appears in the bottom dock

### Requirement: Prompt screen renders hero onboarding plus prompt form
The `PromptScreen` SHALL render a purple-nebula hero at its top portion containing an UPPERCASE condensed title `СОЗДАТЬ ПЛЕЙЛИСТ`, a tiny `◉ AGENT MUSIC` chip, and three short benefit rows with thin-stroke Phosphor icons, followed below by the existing prompt `<textarea>` and primary `Собрать плейлист` button, with no separate first-launch welcome route.

#### Scenario: Prompt screen shows hero and form together
- **WHEN** the active screen kind is `prompt`
- **THEN** the top of the screen shows a UPPERCASE `СОЗДАТЬ ПЛЕЙЛИСТ` title over the purple nebula, a `◉ AGENT MUSIC` chip, and three benefit rows
- **AND** the existing `<textarea>` and `Собрать плейлист` primary button render below the hero
- **AND** submitting the form triggers the same `onSubmit` callback as before

### Requirement: Shop screen renders catalog-style layout
The `Магазин` (previously `BuyScreen`) screen SHALL render a search input, a horizontal category-pill row that filters offers by `grantKind`, a sort segmented control that re-orders the displayed offers, a `ПАКЕТЫ ────` section label, and one tall dark-card row per offer with the offer title, grant sub-label, right-aligned price, and a purple chevron; clicking a row SHALL trigger the existing `purchaseOffer`-driven buy flow with no behavior change.

#### Scenario: Admin's offers render as catalog rows
- **WHEN** the active screen kind is `buy` and at least one active offer exists
- **THEN** a search input with placeholder `Поиск по пакетам…` renders at the top
- **AND** a horizontal row of category pills (`Все`, `Генерации`, `Подписка`) renders below the search input
- **AND** a sort `Segmented` control with options `Дешевле` / `Дороже` / `Популярное` renders below the category pills
- **AND** a `ПАКЕТЫ ────` section label renders above the offer list
- **AND** each offer renders as a tall dark card with bold `title`, grant sub-label, right-aligned `amount asset`, and a purple `CaretRight` chevron
- **AND** tapping a row triggers the same `buy(o.id)` action as the previous implementation

#### Scenario: Filter and sort operate client-side only
- **WHEN** the user enters text in the search input or selects a category pill or sort option
- **THEN** the displayed offer list is filtered by `title` (case-insensitive contains) and/or by `grantKind` and/or re-ordered by the selected sort option, with no additional HTTP request

### Requirement: Dedicated profile screen
The Mini App SHALL introduce a `profile` screen kind and a `ProfileScreen` component that renders the `agent music` mark in a circular chip, the user's display name (`@username` or `ID <chatId>`), a balance card with credits and subscription status and a white `+ Пополнить` primary button that navigates to `Магазин`, and a `МОИ ПОКУПКИ ────` section listing paid invoices or an empty-state Phosphor `Package` icon row when there are none.

#### Scenario: Profile screen shows identity and balance
- **WHEN** the active screen kind is `profile`
- **THEN** the screen renders a circular `agent music` mark, a display name (`@username` if present, otherwise `ID <chatId>`), and a balance card containing `me.credits`, the subscription status, and a white `+ Пополнить` primary button
- **AND** tapping `+ Пополнить` navigates to the `Магазин` screen

#### Scenario: Profile screen shows paid purchases or an empty state
- **WHEN** the profile screen renders and the `/api/purchases` response contains at least one paid invoice
- **THEN** each paid invoice lists under a `МОИ ПОКУПКИ ────` section label
- **AND** when there are zero paid invoices the section shows a Phosphor `Package` thin-stroke icon and the text `Покупок пока нет`

### Requirement: Remaining screens restyle under the theme
The `ResultsScreen`, `ClarifyScreen`, `AdminScreen`, and `SettingsScreen` SHALL adopt the dark-card / hairline-surface treatment supplied by the theme change, and SHALL not alter their data flow or callbacks.

#### Scenario: Results tracks become dark hairline rows
- **WHEN** the `results` screen renders a playlist
- **THEN** each track row is visually wrapped in a dark card with hairline separators between rows
- **AND** the `Новый плейлист` button renders as a dark secondary pill (no longer the green primary)
- **AND** the `onNewPrompt` behavior is unchanged

#### Scenario: Clarify options become dark chevron rows
- **WHEN** the `clarify` screen renders
- **THEN** each option button renders as a dark pill row with a purple `CaretRight` chevron on the right
- **AND** tapping a row invokes the same `onAnswer(option)` callback as before

### Requirement: Optional purchase-success toast
The `Магазин` screen MAY render a one-shot "checkmark ring" toast with a purple-glow halo when the paid-invoice count detected on mount exceeds the count stored in `localStorage`, and the toast SHALL auto-dismiss within 2.5 seconds and update the stored count so it does not reappear for the same count.

#### Scenario: Toast appears on a new paid invoice
- **WHEN** the `Магазин` screen mounts and `paidInvoices.length` is greater than the `localStorage["am_last_paid_count"]` value
- **THEN** a one-shot checkmark-ring toast with a purple glow renders
- **AND** the toast auto-dismisses within 2.5 seconds
- **AND** `localStorage["am_last_paid_count"]` is updated to the new count

### Requirement: Additive MeResponse fields for the profile
The `/api/me` response SHALL include a `username?: string` field and a `chatId: number` field in addition to the existing `isAdmin`, `credits`, and `subscriptionUntil` fields; the addition SHALL be backward-compatible (clients that ignore these fields continue to work).

#### Scenario: MeResponse carries identity fields
- **WHEN** the Mini App calls `api.me()`
- **THEN** the response includes `chatId: number` and `username?: string`
- **AND** a client that parses only `isAdmin` / `credits` / `subscriptionUntil` still works unchanged