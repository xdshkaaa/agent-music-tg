## Why

The Telegram bot and Mini App work, but their current Liquid-Glass navy/green skin reads as a generic Apple-y demo rather than a product with its own identity. The previous planning session locked a visual language inspired by a STATICA-style dark/purple-accent reference: near-black canvas, purple nebula hero glow, uppercase section labels with thin rules, dark `#141416` cards, a floating bottom dock, and Telegram Premium custom-emoji glyphs on inline buttons. This change restyles the surfaces (Mini App CSS + React chrome, bot message text + inline keyboards) without touching product logic, payment flows, or the agent/music backend.

## What Changes

- **Mini App theme tokens** (`miniapp/src/styles/glass.css`): swap green `--accent`/`--accent-deep` for purple `#A855F7`/`#7C3AED`; repaint `.app-shell` background to `#0A0A0B` + upper-left purple radial glow; introduce `--bg`, `--card`, `--hairline`, `--muted`, `--radius-card` tokens; add `.section-label` (UPPERCASE letterspaced + thin rule) and `.chevron` helpers; re-tune `data-scheme="light"` overrides to purple-on-soft-gray (kept, not removed — dark-only is out of scope).
- **Mini App shell & navigations** (`miniapp/src/App.tsx`): replace top `<nav className="nav-row">` glass buttons with a top bar (`agent music` logo chip + `Wallet` credits pill) and a floating bottom dock (3 tabs: `Создать` / `Магазин` / `Профиль`, plus an admin-gated 4th `Админ`). `Настройки` folds into `Админ` as a sub-card. Screen variants add a `profile` kind; logic stays identical.
- **Mini App screens** (`miniapp/src/screens/*.tsx`): restyle `PromptScreen` with a purple-nebula hero + UPPERCASE condensed title + 3 benefit rows above the existing `<textarea>`; `BuyScreen` adds a cosmetic search input + `grantKind` category pills + sort segmented + tall product-row cards (no `buy()` flow change); `ResultsScreen` track rows become dark hairline cards; `ClarifyScreen` option rows get purple chevrons; new `ProfileScreen.tsx` (extracted from `BuyScreen`'s profile block + bot `/profile`) with `agent music` mark, balance card, and `МОИ ПОКУПКИ` empty-state; `AdminScreen`/`SettingsScreen` panels retuned to dark cards. Optional one-shot purchase-success "checkmark ring" toast driven by a `localStorage` diff in `BuyScreen` (no new route).
- **Bot Premium emoji** (new `server/bot/emoji.ts`, optional `EMOJI_STICKER_SET` env in `server/env.ts` + `.env.example`): resolves one Telegram custom-emoji sticker set owned by the bot to a `symbol → custom_emoji_id` map; exposes `btn(label, symbol)` for inline-button labels and `accent(text)` for `<tg-emoji>` purple glyph tags in message text. Falls back to plain unicode emoji when the env is unset → zero hard dependency, no regression on tokenless deploys.
- **Bot messages & inline keyboards** (`server/bot/index.ts`, `server/bot/shop.ts`, `server/bot/admin-panel.ts`): `/start`, `/app`, `/about`, `/buy`, `/profile`, `/admin`, the offers keyboard rows, and the admin menu keyboard rows are restyled — uppercase-style headers via `<tg-emoji>` purple glyphs and Premium-emoji prefixes on inline button labels. Callback data strings (`buy:<id>`, `admin:*`) are unchanged; structure of keyboards is unchanged.
- **Typeface**: `miniapp/index.html` swaps Manrope for a sharper grotesk (Inter Tight or Geist via Google Fonts / self-host) to match STATICA's "sharp grotesk sans" rule.
- **Out of scope**: separate first-launch Welcome screen beyond `PromptScreen`'s hero; offer-product-detail drill-down; real user avatar/identity; pivoting the product into a literal accounts marketplace; removing `data-scheme="light"`; music/agent/payment backend logic; `bot/middleware.ts`, `context.ts`, `session.ts`.

## Capabilities

### New Capabilities
- `mini-app-theme`: New STATICA-style dark/purple visual design system for the Mini App — color tokens, typeface, dark cards, section labels, hero nebula glow, floating bottom dock.
- `mini-app-screens`: New layouts for each Mini App screen (Prompt hero, Shop catalog, Profile, Results, Clarify, Admin/Settings sub-card) using the new theme; includes a new `profile` screen kind.
- `bot-premium-emoji`: New optional Telegram Premium custom-emoji integration for bot inline-button labels and message-text `<tg-emoji>` decorations, with plain-unicode fallback.
- `bot-ui-copy`: New uppercase/purple-accented copy style for bot commands (`/start`, `/app`, `/about`, `/buy`, `/profile`, `/admin`) and their inline-keyboard labels.

### Modified Capabilities
<!-- No existing specs in openspec/specs/ — all capabilities are introduced fresh. -->

## Impact

- **Code surfaces (editable, all within this repo per actionContext.allowedEditRoots)**:
  - `miniapp/src/styles/glass.css` — theme tokens + `.section-label`, `.chevron`, light-scheme retune.
  - `miniapp/src/App.tsx` — top bar + floating dock, new `profile` screen kind, admin-gated 4th tab, `Настройки` folded under `Админ`.
  - `miniapp/src/screens/PromptScreen.tsx`, `BuyScreen.tsx`, `ResultsScreen.tsx`, `ClarifyScreen.tsx`, `AdminScreen.tsx`, `SettingsScreen.tsx` — restyle + light structural additions (search, category pills, sort, profile extraction).
  - New `miniapp/src/screens/ProfileScreen.tsx`.
  - `miniapp/index.html` — typeface swap (new `<link>` / font swap).
  - `miniapp/src/components/*` — minor (new dock component if extracted; `Segmented`, `GlassPanel` inherit new card skin via the CSS change).
  - New `server/bot/emoji.ts`; edits in `server/bot/index.ts`, `shop.ts`, `admin-panel.ts` (text + keyboard label composition only).
  - `server/env.ts` + `.env.example` — add optional `EMOJI_STICKER_SET`.
- **APIs / contracts**: none. No REST routes, callback data schemas, DB columns, or grammy command surface changes. `/api/me` still returns `isAdmin`; the Mini App continues to gate the `Админ` tab off it.
- **Dependencies**: no new npm packages required (Phosphor icons already present). Google Fonts / self-hosted grotesk is a build-time asset for the Mini App; no runtime server dep added. Bot premium-emoji path uses grammy's existing Telegram Bot API methods (`getStickerSet`, inline keyboard `text` with `<custom_emoji_id:...>` markup) — no new package.
- **Systems / data**: none. `data-scheme="light"` is retained, just re-tuned. `.env` gains one optional var. No DB migration.
- **Risk notes**:
  - Premium-emoji inline buttons require a Telegram custom-emoji sticker set **owned by the bot**. Until one is registered (via @BotFather or provided through `EMOJI_STICKER_SET`), the bot falls back to plain unicode emoji — the redesign still ships visually, just without the purple custom glyphs on buttons.
  - The `.glass-panel::before` tilted highlight currently reads as glass; STATICA wants flatter cards. The plan keeps a subtle inner top-edge light inset rather than going fully flat, so the "reveal" motion still sees layered surfaces.
  - Folding `Настройки` inside `Админ` changes admins' muscle memory slightly (one extra tap to reach provider/backend switches).