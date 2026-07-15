# Design: profile-legal-nav

## Context

`bot.callbackQuery(/^nav:(\w+)$/)` in `server/bot/index.ts` currently answers the callback and calls section renderers (`showProfile`, `sendOffers`, `showHistory`) that all `ctx.reply(...)` — each tap adds a new message. `showProfile` sometimes sends a photo card (`replyWithPhoto` with the user's avatar). The `/start` message body is built from shop settings and the keyboard from `buildStartKeyboard(ctx)`.

Legal documents live on telegra.ph:
- Пользовательское соглашение: https://telegra.ph/Polzovatelskoe-soglashenie-07-15-25
- Политика конфиденциальности: https://telegra.ph/Politika-konfidencialnosti-07-15-41
- Политика возврата средств: URL not yet provided (TBD)

## Goals / Non-Goals

**Goals:**
- All `/start` nav buttons switch the *same* message between sections via `editMessageText`.
- Every section view has «Назад» returning to the main menu view, same message.
- Profile view exposes the three legal documents as URL buttons.
- Slash commands keep current behavior (fresh messages, profile photo card intact).

**Non-Goals:**
- No Mini App changes.
- No admin-editable legal URLs (constants are enough; can move to shop settings later).
- No in-place rendering for the admin panel (it has its own multi-step flows) — «Админка» keeps sending its own message.
- Offers with image icons still go out as separate photo cards from the buy section (photos can't live inside an edited text message).

## Decisions

1. **Edit-in-place via renderer refactor, not duplication.** Split each section renderer into a pure `build*View(db, chatId) → { text, keyboard }` function plus thin senders. The nav callback handler calls `ctx.editMessageText(text, { reply_markup, parse_mode: "HTML" })`; slash commands call `ctx.reply` with the same view. Avoids two diverging copies of section text.
   - Alternative considered: separate "inline" renderers — rejected, guaranteed drift.

2. **`nav:menu` callback for back.** «Назад» button carries `callback_data: "nav:menu"`; handler rebuilds the `/start` text + `buildStartKeyboard(ctx)` and edits the message back. The `/start` body builder is extracted into a function so command and callback share it.

3. **Profile in-place is text-only.** A Telegram text message cannot be edited into a photo message. In-place profile renders the same text lines without the avatar photo. `/profile` command unchanged (photo card kept).

4. **Legal URLs as a constants module** (`server/bot/legal.ts`): `LEGAL_DOCS: { title, url }[]`. Refund policy entry ships with the placeholder URL and is filtered out of the keyboard while it equals the placeholder, so no dead link is shown until the real URL lands. Legal buttons are `InlineKeyboard.url(...)` rows — URL buttons need no callback handling and open telegra.ph in Telegram's in-app browser.
   - Alternative: store in shop settings (admin-editable) — more machinery than needed now.

5. **Buy section in-place with photo-card caveat.** `nav:buy` edits the message to the offers text + text-row offers keyboard + «Назад». Offers that have image icons are still sent as separate photo cards after the edit (current `sendOffers` behavior for those) — acceptable, they are purchase cards, not navigation.

6. **Graceful edit failure.** `editMessageText` throws if content is identical or the message is too old; wrap in try/catch and fall back to `ctx.reply` with the same view so navigation never dies silently.

## Risks / Trade-offs

- [Trial claim button edits the *offers* keyboard from within buy view] → `trial:claim` handler already re-renders the keyboard via `editMessageReplyMarkup`; after refactor it must rebuild the buy-view keyboard (offers + back) when invoked from the nav message. Keep both paths: if the message is the nav message, rebuild with back button.
- [History pagination/content may exceed 4096 chars when edited] → same limit as reply; `showHistory` already truncates per its own rules; keep truncation in the shared view builder.
- [Old /start messages with stale keyboards] → callbacks still work; edit fallback to reply covers uneditable (48h+) messages.
- [Refund URL missing] → placeholder filtered from UI until provided; single-line change to activate.

## Migration Plan

Pure code change, no data migration. Deploy normally; old messages degrade gracefully (fallback reply). Rollback = revert commit.

## Open Questions

- Refund policy URL — awaiting link from user. Ship with hidden placeholder; add URL when provided.
