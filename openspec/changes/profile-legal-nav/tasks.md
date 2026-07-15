# Tasks: profile-legal-nav

## 1. Legal constants

- [x] 1.1 Create `server/bot/legal.ts` with `LEGAL_DOCS` (title + url): user agreement (https://telegra.ph/Polzovatelskoe-soglashenie-07-15-25), privacy policy (https://telegra.ph/Politika-konfidencialnosti-07-15-41), refund policy (placeholder, filtered out while unset) + helper returning only configured docs

## 2. View builders (pure text+keyboard)

- [x] 2.1 Extract `/start` menu body into `buildMenuView(ctx, db)` returning `{ text, keyboard }`; reuse in `/start` command
- [x] 2.2 Refactor `showProfile` in `server/bot/shop.ts`: extract `buildProfileView(db, chatId)` (text lines); keep `/profile` photo-card path; add keyboard variant with legal URL buttons + «Назад» (`nav:menu`)
- [x] 2.3 Refactor offers: extract `buildBuyView(db, chatId)` (header text + text-row offers keyboard + «Назад»); keep image-icon offers as separate photo cards sent after
- [x] 2.4 Refactor `showHistory` in `server/bot/history.ts`: extract `buildHistoryView(db, chatId)` with «Назад» keyboard
- [x] 2.5 Support view: `buildSupportView(db)` text + «Назад» keyboard

## 3. In-place nav handler

- [x] 3.1 Rewrite `nav:` callback in `server/bot/index.ts`: buy/profile/history/support use `ctx.editMessageText(view.text, { reply_markup, parse_mode: "HTML" })`; admin keeps `ctx.reply`
- [x] 3.2 Add `nav:menu` case (back button) editing message back to menu view
- [x] 3.3 Wrap edits in try/catch, fall back to `ctx.reply` with the same view on failure
- [x] 3.4 Update `trial:claim` handler to rebuild the buy-view keyboard (offers + «Назад») when triggered from the nav message

## 4. Verify

- [x] 4.1 `bun run typecheck` and `bun test` pass
- [ ] 4.2 Manual check in Telegram: /start → Профиль (legal buttons visible, telegra.ph opens) → Назад → Купить → Назад → История → Назад → Поддержка → Назад, all in one message; /profile command still shows photo card
- [ ] 4.3 Confirm refund-policy button hidden while URL is placeholder
