# profile-legal-nav

## Why

The bot's `/start` navigation currently spawns a new message for every button press (profile, buy, history, support), cluttering the chat. There is also no way for users to view the legal documents (user agreement, privacy policy, refund policy) that a paid product must expose. Both problems are solved together: single-message in-place navigation with a back button, and legal document links added under the profile section.

## What Changes

- `/start` navigation becomes **in-place**: pressing «Профиль», «Купить», «История», «Поддержка» edits the same message (`editMessageText`) instead of sending new messages.
- Every in-place section gets a «Назад» button that returns to the main `/start` menu, in the same message.
- The profile section gains a legal documents block with three buttons:
  - «Пользовательское соглашение» → https://telegra.ph/Polzovatelskoe-soglashenie-07-15-25
  - «Политика конфиденциальности» → https://telegra.ph/Politika-konfidencialnosti-07-15-41
  - «Политика возврата средств» → URL **TBD** (user will provide; ship with placeholder constant)
- Legal buttons are Telegram URL buttons (open telegra.ph in the in-app browser), so no extra message state is needed.
- Profile rendered in-place is text-only (photo messages cannot be edited into text messages); the standalone `/profile` command keeps its current photo-card behavior.
- Slash commands (`/profile`, `/buy`, `/history`, `/support`) keep replying with fresh messages — only the inline nav goes in-place.

## Capabilities

### New Capabilities
- `legal-documents`: Legal document links (user agreement, privacy policy, refund policy) exposed as inline URL buttons in the bot's profile section.

### Modified Capabilities
- `start-navigation`: Navigation buttons now edit the origin message in-place with a back button, instead of sending new messages.

## Impact

- `server/bot/index.ts` — nav callback handler rewritten to edit-in-place, back-button callback added.
- `server/bot/shop.ts` — `showProfile` gains an in-place rendering mode (text + legal/back keyboard); `sendOffers` gains an in-place variant or the buy section renders offers into the same message.
- `server/bot/history.ts` — `showHistory` gains an in-place rendering mode.
- New constants module for legal document URLs.
- No DB schema, API, or Mini App changes.
