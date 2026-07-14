## Context

`agent-music-tg` — Telegram бот + Mini App для генерации плейлистов через AI. Профиль показывается в двух местах:
- **Mini App ProfileScreen** — React компонент с декоративной заглушкой (цветная точка в круге 52px)
- **Bot `/profile`** — текстовое сообщение с кредитами, подпиской, покупками

Telegram Bot API предоставляет `getUserProfilePhotos` для получения фотографий профиля пользователя. Mini App получает initData через Telegram WebApp, но это поле не содержит `photo_url`.

## Goals / Non-Goals

**Goals:**
- Отображать реальную аватарку Telegram в Mini App ProfileScreen
- Отправлять фото профиля в ответ на `/profile` в боте
- Кэшировать file_id фото в SQLite при `/start` (не чаще)
- Graceful fallback при отсутствии фото у пользователя
- Обратно совместимый API (поле `photoUrl` опционально)

**Non-Goals:**
- Не проксировать фото через свой сервер (используем прямой URL Telegram)
- Не обновлять фото чаще одного раза за сессию
- Не добавлять загрузку/смену фото (это делает сам Telegram)
- Не показывать фото в других экранах Mini App

## Decisions

### 1. SQLite: новая колонка `photo_file_id`
Добавить `photo_file_id TEXT` в таблицу `users`. Это простое текстовое поле, хранящее file_id самого большого фото из `getUserProfilePhotos`. Миграция через `ALTER TABLE IF NOT EXISTS`.

### 2. Получение фото при `/start`
В обработчике `/start` после `upsertUser` вызывать `bot.api.getUserProfilePhotos(chatId, { limit: 1 })`. Если результат содержит фото, взять самое большое (последний `PhotoSize` в первом массиве) и сохранить `file_id` в БД. Это неблокирующая операция (fire-and-forget, но с `await` для гарантии записи).

### 3. URL фото через `getFile`
Для Mini App формируем URL: вызываем `bot.api.getFile(fileId)` → получаем `file_path` → конструируем `https://api.telegram.org/file/bot<token>/<file_path>`. Альтернатива: проксировать через свой сервер (чтобы не светить токен). Прокси-эндпоинт НЕ делаем в этом change — токен и так используется в bot API; риск минимален. Если нужна безопасность — следующий change.

### 4. Fallback в Mini App
При отсутствии `photoUrl` (нет фото, не удалось получить) — показываем иконку `User` из Phosphor вместо точки.

### 5. Bot `/profile` с фото
Используем `ctx.replyWithPhoto(fileId, { caption })`. Если фото нет — текущее текстовое поведение. Фото отправляется с текстом как caption.

## Risks / Trade-offs

- **URL с токеном** → `getFile` возвращает ссылку с токеном бота. Принято: токен уже используется для API, риск утечки через URL минимален.
- **Rate limit** → `getUserProfilePhotos` вызывается только при `/start`. Если пользователь сменил фото — до следующего `/start` будет старое.
- **Нет фото** → `getUserProfilePhotos` возвращает пустой массив. Fallback корректно обрабатывается.
- **Telegram CDN** → URL через `api.telegram.org` может работать медленно. Принято: для аватарки 52px — некритично.
