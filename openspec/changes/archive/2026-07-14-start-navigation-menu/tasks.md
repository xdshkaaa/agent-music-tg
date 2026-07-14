## 1. Refactor — вынести тела команд в экспортируемые функции

- [x] 1.1 `server/bot/shop.ts` — вынести тело `/profile` в экспортируемую функцию `showProfile(ctx, db)` (заменить `bot.command("profile", ...)` на вызов этой функции)
- [x] 1.2 `server/bot/generate.ts` — вынести тело `/generate` в экспортируемую функцию `showGenerate(ctx, db, arg?)` (заменить `bot.command("generate", ...)` на вызов)
- [x] 1.3 `server/bot/history.ts` — вынести тело `/history` в экспортируемую функцию `showHistory(ctx, db)` (заменить `bot.command("history", ...)` на вызов)

## 2. Навигационное меню

- [x] 2.1 `server/bot/index.ts` — создать функцию `buildStartKeyboard(ctx): InlineKeyboard`, которая собирает клавиатуру: WebApp (full-width), затем ряды по 2 (Купить/Генерация, Профиль/История), затем Поддержка (full-width), и условная Админка для админов
- [x] 2.2 `server/bot/index.ts` — добавить хендлер `bot.callbackQuery(/^nav:(\w+)$/)`, который диспетчеризует нажатия на вынесенные функции и отвечает callback query
- [x] 2.3 `server/bot/index.ts` — обновить хендлер `/start`: использовать `buildStartKeyboard` вместо одиночной WebApp-кнопки, убрать текстовый список команд из сообщения
