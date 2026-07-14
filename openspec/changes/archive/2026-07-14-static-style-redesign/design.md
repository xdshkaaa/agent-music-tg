## Context

`agent-music-tg` (this repo) is a Telegram bot plus a React Mini App that turns a prompt into a real playlist via an AI agent. Music comes from YouTube Music / SoundCloud; access is paywalled through CryptoBot Crypto Pay. The Mini App is a React 18 + Vite + TypeScript SPA with screens for: prompt → clarify → results, a shop/buy (offers), admin (stats / offers / broadcast / shop settings), and settings (provider / backend). The bot is grammy-based with inline keyboards for shop, profile, and an admin panel. The visual baseline is a "Liquid Glass" navy/green theme in `miniapp/src/styles/glass.css`; the bot side has no styling beyond plain unicode emoji prefixes on inline buttons.

A planning session locked a redesign to a STATICA-inspired dark canvas + purple accent (`--accent: #A855F7`), and Premium custom-emoji glyphs on inline buttons. The product itself is **not** changing — this is a pure surface redesign. All product/agent/payment logic, REST contracts, DB schema, callback-data strings, and grammy command structure stay identical so existing tests keep passing and existing sessions are not broken.

Stakeholders: the bot's allowlist users (see the redesign), admins (more admin chrome to navigate), the deploy story (`./deploy/deploy.sh` rsyncs Mini App build + server → unchanged).

## Goals / Non-Goals

**Goals:**
- A visually distinctive dark + purple identity that reads as "agent music" rather than a generic glassy demo, across both the Mini App and the bot inline UI.
- A defined design-token layer (color, type, radii, spacing, hairline) so future Mini App work composes against the same language instead of re-inventing surfaces.
- A floating bottom dock with 3 standard tabs + an admin-gated 4th, replacing the top row of glass buttons, while preserving every current screen route.
- Bot inline-keyboard labels and message headings that use Telegram Premium custom emoji when available and degrade cleanly to plain unicode emoji otherwise.
- No new runtime npm dependencies and no DB/payment/agent-backend changes.

**Non-Goals:**
- Removing the `data-scheme="light"` path or forcing dark-only.
- Splitting `PromptScreen` into a separate first-launch welcome screen.
- Introducing an offer-product-detail drill-down (offers continue to call `purchaseOffer` → CryptoBot pay URL).
- Real user avatar/identity (users stay anonymous allowlist IDs; the profile mark is `agent music`).
- A literal STATICA-style accounts marketplace (the product remains a playlist generator).
- Any change to the AI provider / music backend / CryptoBot integration.
- Any change to bot middleware, session FSM, or callback-data schemas.

## Decisions

### 1. Token-first repaint in `glass.css` (file kept, not renamed)
Repurpose the existing `miniapp/src/styles/glass.css` rather than creating a new `theme.css`. All screens import `glass.css` transitively via `main.tsx`; keeping the filename means **zero import churn** and prevents accidental double-imports during rollout.
- Purple accent tokens: `--accent: #A855F7`, `--accent-deep: #7C3AED`. Replaces green `#1ed760` / `#12a34a`.
- New baseline tokens: `--bg: #0A0A0B`, `--card: #141416`, `--hairline: #232326`, `--muted: #8A8A8E`, `--radius-card: 20px`.
- Background: `.app-shell` swaps the navy radial for `radial-gradient(circle at 18% 0%, rgba(168,85,247,0.22) 0%, #0A0A0B 55%)` — upper-left purple nebula fading to pure black. Grain overlay stays (matches STATICA's film-grain rule).
- `.glass-panel` background → `var(--card)`, border → `1px solid var(--hairline)`, radius → `var(--radius-card)`. The `::before` tilted highlight is **softened** (opacity 0.18, narrower gradient) rather than removed — keeps perceived depth for the existing `reveal`/`reveal-stagger` motion.
- `.glass-button.primary` → solid white (`#FFFFFF`) background with black bold text — the STATICA "primary = solid white pill" rule — and a purple `box-shadow` glow on hover (replaces the green one in `@media (hover: hover)`).
- New helpers in the same file:
  - `.section-label` — UPPERCASE, `letter-spacing: 0.16em`, `font-size: 12px`, `color: var(--muted)`, with a thin rule drawn by a flexbox `::after { content: ""; flex: 1; height: 1px; background: var(--hairline); }` alongside the label (STATICA `КАТАЛОГ ────` motif).
  - `.chevron` — small `CaretRight`-shaped CSS helper (or a Phosphor icon used inline in screens; CSS class left as a tint hook).
- `:root[data-scheme="light"]` overrides are **kept and re-tuned** to purple-on-soft-gray (accent stays `#A855F7`/`#7C3AED`; card → `#FFFFFF`, hairline → `rgba(0,0,0,0.08)`, background → soft gray radial). Dark-only is an explicit non-goal.
- **Alternatives considered**: (a) new `theme.css` + churn all imports — rejected, motion risk; (b) CSS-in-JS / Tailwind — rejected, repo has no toolchain, vanilla CSS is the established convention; (c) flat cards (drop `::before` highlight entirely) — kept softened inset to preserve the existing entrance animations.

### 2. Typeface swap in `miniapp/index.html`
Replace Manrope (`--font-display`) with **Inter Tight** via Google Fonts `<link>` (Inter Tight closely matches STATICA's "sharp grotesk sans" requirement and is a single-family download). `--font-display` becomes `"Inter Tight", -apple-system, …`. Body font stays native system stack (`--font-body`).
- **Alternatives**: Geist (good, but self-host required → adds a build step); Inter (slightly less condensed than STATICA wants); keep Manrope (decided too soft). Inter Tight chosen for zero-build-step + the desired condensed grotesk feel.

### 3. Shell & navigation restructure in `App.tsx`
- Replace `<nav className="nav-row">` (4 conditional glass buttons) with two new pieces:
  1. **Top bar** — sticky `header`: `agent music` logo chip on the left (white ring glyph + wordmark, drop the CSS ring into the existing logo or an inline SVG), and a **wallet pill** on the right (Phosphor `Wallet` icon + `{me.credits} ген`). Credits come from the existing `api.me()` response already fetched in `App.tsx` via `setIsAdmin`; refetch already returns `credits`. No new API.
  2. **Floating bottom dock** — `position: sticky; bottom: 8px;` pill containing 3 (or 4 for admins) tabs. Each tab is a Phosphor icon + tiny label; active tab gets a lighter pill surface and a purple icon tint. Tabs: `Создать` (`Sparkle`) routes to `{kind:"prompt"}`, the clarify/results kinds inherit its active state; `Магазин` (`Storefront`) → `{kind:"buy"}`; `Профиль` (`User`) → `{kind:"profile"}` (new); `Админ` (`Shield`, admin-only) → `{kind:"admin"}`.
- `Настройки` (provider / backend screen) is no longer its own dock tab. It folds into the `Админ` screen as a stacked card so the dock stays at 3+1. `SettingsScreen` is still its own component (loaded via `React.lazy` as today); it's just rendered inside `AdminScreen`'s layout instead of switched from the dock. Lazy-loading boundary is preserved.
- `Screen` union gains `{ kind: "profile" }`. The `buy` kind no longer renders the profile block — `BuyScreen` keeps offers only; `ProfileScreen` (new) renders the balance + purchases + "back to shop" CTA. Both reuse the same `api.me()` / `api.purchases()` calls.
- **Alternatives**: (a) keep 5 tabs in the dock (crowded, violates STATICA's airy rule); (b) extract admin tools into a long-press overflow menu on `Админ` (raises touch target/a11y complexity); (c) put `Настройки` behind its own 5th admin tab (rejected for non-goal of keeping dock at 3+1). Chosen layout keeps the spec's airy-spacing rule and is the smallest delta from today.

### 4. New `ProfileScreen.tsx` (extracted from `BuyScreen` + bot `/profile`)
- Renders the `agent music` mark in a circular chip (inline SVG of the white ring on `--card`), name = `@${username}` if present else `ID ${chatId}` (both available from a small new field on `MeResponse` — see "API additions" below), a balance card (`АККАУНТ ────` section label, `Баланс`, `me.credits` big number left, white `+ Пополнить` primary button right that sets screen to `{kind:"buy"}`), and a `МОИ ПОКУПКИ ────` section with paid invoices from `api.purchases()`. Empty state: a Phosphor `Package` thin-stroke icon + `Покупок пока нет` + a small dark "В магазин" pill.
- **API additions**: `/api/me` already returns `{isAdmin, credits, subscriptionUntil}`. To populate the profile header we add `username?: string` and `chatId: number` to `MeResponse` (both already known to the server — `users-store.getUser` and the gate). No schema migration, no new route. This is the only payload change in the whole change; flagged here for visibility.
- **Alternatives**: reuse `BuyScreen` as the profile surface (rejected — Buy keeps "shop" intent, mixing profile into it muddies the dock semantics). New screen chosen for clean separation.

### 5. `PromptScreen` becomes the onboarding+prompt surface
- Top 45% of the screen is a **purple nebula hero**: the `.app-shell` radial already draws the nebula, so the hero is just a transparent container with UPPERCASE condensed `СОЗДАТЬ ПЛЕЙЛИСТ` title, then a tiny `◉ AGENT MUSIC` chip (single source of truth for the wordmark), then three benefit rows (Phosphor thin purple icons + one line each: "Опишите настроение", "Моментальная генерация", "Поддержка 24/7").
- Below the hero sits the existing `<textarea>` + primary `Собрать плейлист` pill (restyled white-on-black per Decision 1). `busy` skeleton unchanged.
- **No first-launch welcome screen** by design (non-goal) — the nebula hero already establishes brand on every prompt mount.
- **Alternatives**: a dedicated routed welcome screen before `prompt` (rejected — adds a route + localStorage "seen" flag, scope creep for an aesthetic change).

### 6. `BuyScreen` → STATICA catalog layout
- Add a **search input** (Phosphor `MagnifyingGlass` + `glass-input` styling) that filters the offers list client-side by `title.contains(query)`. Cosmetic, scope-limited, marked optional in tasks.
- **Category pills** — horizontal scrollable row of `grantKind` filters: `Все` (active by default), `Генерации`, `Подписка`. Selecting a pill filters the offers list by `o.grantKind`.
- **Sort segmented** — reuse existing `Segmented` component, three options `Дешевле` / `Дороже` / `Популярное` (active-first). Sorts the filtered offers array in-place.
- Section label `ПАКЕТЫ ────`. Each offer is a tall `.glass-panel` row: left logo tile (a small purple-ring mark), bold `o.title` + grant sub-label, right-aligned `o.amount o.asset` + a purple `CaretRight`. Click → existing `buy(o.id)` flow. `busyId` state, `openPayUrl`, error path — unchanged.
- **Alternatives**: server-side search/sort (rejected — data set is tiny admin-curated list; client filtering keeps the spec local to the redesign and avoids new routes). Chosen to keep "no API change other than `/api/me` additions".

### 7. Other screens: recount, no logic change
- `ResultsScreen` track rows: wrap rows in `.glass-panel` cards with `1px solid var(--hairline)` separators; the "Новый плейлист" button becomes a dark secondary pill (class `glass-button` minus `primary`).
- `ClarifyScreen` option buttons: restyle to dark pill rows with a purple `CaretRight` chevron on the right; `onAnswer` unchanged.
- `AdminScreen` panels: already `.glass-panel` — inherit the new dark card skin from the CSS change automatically. `SettingsScreen`'s `Segmented` components keep working unchanged (same component, rethemed by CSS). Both render from inside `Админ` (Settings folded under Admin per Decision 3).
- Optional **purchase-success toast**: on `BuyScreen` mount, compare `paidInvoices.length` to `localStorage["am_last_paid_count"]`. If higher → render a one-shot blue/purple-glow "checkmark ring" toast that auto-dismisses in 2.5s and updates the stored number. No new route, no new screen. Marked optional in tasks; default behavior unchanged if skipped.
- **Alternatives**: a dedicated `/success` deep-link (rejected — the only way to land there is an async callback; we don't control a return route from CryptoBot).

### 8. Bot Premium emoji — `server/bot/emoji.ts`
- New module exposing:
  - `const symbolToEmojiId: Map<string, string>` keyed by symbol name (`"info"`, `"diamond"`, `"music"`, `"stats"`, `"package"`, `"broadcast"`, `"gear"`, `"check"`, `"profile"`, `"wallet"`, `"plus"`, `"ruler"`, `"sparkle"`) → `custom_emoji_id`.
  - `async function loadCustomEmojis(bot: Bot): Promise<void>` — once, at startup, if `env.emojiStickerSet` is set, call `bot.api.getStickerSet(env.emojiStickerSet)`; map each sticker's `custom_emoji_id` to a symbol using a **convention file** (`server/bot/emoji-symbols.json`) that maps `custom_emoji_id` → symbol. If the set lacks a symbol mapping, that entry is skipped silently. Map is cached for the process lifetime.
  - `function btnText(label: string, symbol: string, style?: "danger"|"success"|"primary"): { text: string; icon_custom_emoji_id?: string; style?: string }` — returns the inline-button first-arg object for grammy's `InlineKeyboard.text/webApp/url`. When `symbol` is mapped, sets `icon_custom_emoji_id` (Telegram renders the bot's custom-emoji glyph before the label). When unmapped, returns `{ text: label }` (clean text, no emoji per the telegram-premium-emoji skill). Optional `style` colors the button (e.g. active/inactive state).
  - `function accent(symbol: string): string` — returns the `<tg-emoji emoji-id="ID">fallback</tg-emoji>` HTML tag for use inside message bodies parsed with `parse_mode: "HTML"`, or the empty string when unmapped (no bare unicode in message text). A `heading(symbol, text)` convenience composes `${accent ? accent + " " + text : text}`.
  - `function fallbackSymbol(symbol: string): string` — the unicode glyph used as the inner visible text of `<tg-emoji>` tags.
- Env addition in `server/env.ts`: `emojiStickerSet: process.env.EMOJI_STICKER_SET ?? ""`. Added to `.env.example` with a comment that it is optional and that omitting it means clean-text fallback (no emoji).
- **Per the telegram-premium-emoji skill**: inline-button `text` is always clean — the premium emoji lives in `icon_custom_emoji_id` (a separate field on `InlineKeyboardButton`), never prepended to the label. Message text uses `<tg-emoji>` tags with the unicode glyph as the inner fallback. No bare unicode emoji is shipped in bot message text or button labels; the only unicode glyphs allowed are the fallback characters inside `<tg-emoji>` tags. grammy's `InlineKeyboard.text(text, data)` accepts an `AbstractInlineKeyboardButton` object (incl. `icon_custom_emoji_id`) as its first arg — confirmed in `node_modules/grammy/out/convenience/keyboard.js`.
- **Alternatives**: (a) ship premium emoji with a unicode prefix fallback — rejected by the skill ("never ship plain unicode emoji in bot UI"); (b) auto-register a sticker set from the bot at startup — rejected, uploading stickers needs @BotFather interaction; (c) hardcode `custom_emoji_id`s — rejected, they are per-set and would break on any rotate. Chosen "convention-file + opt-in env + clean-text fallback" gives a graceful forward path.

### 9. Bot message HTML + keyboard label composition
- `server/bot/index.ts`: `/start` text becomes a short uppercase-headed message. Header is `<b>heading("info", "AGENT MUSIC")</b>` followed by a 3-line bullet list ("Сгенерируй плейлист", "Купи доступ", "Поддержка 24/7") + shop `aboutText`. `parse_mode: "HTML"` so `<tg-emoji>` renders when mapped, clean text otherwise. `/app` and `/about` get `heading("info", ...)`. The existing `InlineKeyboard().webApp(btnText("Открыть приложение", "sparkle"), env.publicOrigin)` keyboard's button carries `icon_custom_emoji_id` when mapped.
- `server/bot/shop.ts`: `offersKeyboard` builds each row via `kb.text(btnText(offerLabel(o), grantSymbol(o)), `buy:${o.id}`)`. `buy:<id>` callback data **untouched**. `purchasePromptText()` returns `<b>heading("ruler", "ДОСТУП ────")</b>\n…`. `/profile` reply restyled into `<b>heading("profile", "ПРОФИЛЬ ─")</b>` heading + `accent("wallet")`/`accent("ruler")`/`accent("package")` glyphs for the lines (clean text when unmapped).
- `server/bot/admin-panel.ts`: `menuKeyboard` rows built via `btnText` (`stats` / `package` / `broadcast` / `gear`). Offer-list toggle rows use `btnText(label, "package", o.active ? "success" : "danger")` to convey state via the `style` field, and the delete button uses `btnText("Удалить", "package", "danger")` — no `✅`/`🚫`/`🗑` unicode status flags in button labels. Callback data and FSM flow unchanged. Callback answer texts (`"Выключен"`, `"Включён"`, `"Удалён"`) are plain text only (with a call-site comment) because `answerCallbackQuery.text` ignores HTML/custom-emoji formatting.
- `server/bot/middleware.ts`, `context.ts`, `session.ts`: **unchanged**.
- **Alternatives**: keep `parse_mode: "Markdown"` and inline `*bold*` formatting — rejected because `<tg-emoji>` requires HTML mode; we migrate only the affected `reply` calls, leaving other Markdown replies untouched.

### 10. Phased rollout (no migration steps)
Single deploy via `./deploy/deploy.sh`. No DB migration (env var only), no API route changes (one `MeResponse` field addition is additive and backward-compatible). Rollback is the standard `/opt/agent-music-tg/releases/<previous>` symlink swap documented in `README.md`. The new `EMOJI_STICKER_SET` env unset = behavior unchanged visually except for new types/colors; safe to deploy before the sticker set is ready.

## Risks / Trade-offs

- **Premium-emoji prerequisite** → Telegram custom-emoji sticker sets must be owned by the bot. Until one is registered and `EMOJI_STICKER_SET` is set, `emoji.ts` returns unicode fallbacks. Shipped redesign is visually correct minus the purple custom glyphs on buttons.
- **`<tg-emoji>` requires HTML `parse_mode`** → migrating specific `ctx.reply` calls from Markdown to HTML. Markdown-formatted replies that aren't touched stay Markdown. Mixing parse modes within one message is not possible; verified each restyled reply contains no Markdown-only constructs.
- **AnswerCallbackQuery.text is plain-only** → callback confirmations cannot show premium emoji; unicode fallback used there. Documented to prevent an attempt.
- **Folding `Настройки` under `Админ`** → admins need one extra tap to reach provider/backend switches. Muscle-memory regression; mitigated by keeping the on-screen section label order unchanged.
- **Light scheme retained** → not strict dark STATICA. The retuned purple-on-gray light tokens keep Day-mode Telegram users readable, at the cost of a slightly less "premium dark" feel for them. Acceptable per locked non-goal.
- **Font CDN dependency** → Google Fonts hosting Inter Tight adds a runtime fetch for the Mini App. Acceptable given existing Telegram WebApp runtime already needs network; falls back to `-apple-system` per the stack.
- **`.glass-panel::before` tilted highlight softened, not removed** → very grain-true STATICA would be fully flat. Kept hardened to preserve the `reveal`/`reveal-stagger` entrance motion's perceived depth; minimal aesthetic compromise.
- **Search/filter/sort on `BuyScreen` is client-only** → fine for admin-curated offer counts (low single digits expected). If offers ever paginate, this needs revisit.
- **`MeResponse` additive fields** → adding `username` / `chatId` to the response is backward-compatible but any external caller parsing strictly would notice. Internal-only callers; no contract consumers outside the Mini App.

## Open Questions

1. **Accent hue** — purple `#A855F7` (locked in planning) confirmed, or flip to red `#E5312B` to match the literal STATICA reference image? (Purple is the planned default.)
2. **Light scheme** — keep retuned purple-on-gray (planned default), or drop `data-scheme="light"` entirely and go strict dark-only STATICA?
3. **Premium-emoji sticker set** — will one be supplied via `EMOJI_STICKER_SET` after deploy, or should the scope grow to include an admin `/emojiset` upload flow? (Default: env-supplied, no upload command shipped in this change.)
4. **Purchase-success toast** — include the optional `localStorage`-diff "checkmark ring" toast in this change, or defer to a follow-up? (Default: include, marked optional in tasks.)