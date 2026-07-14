## Why

В профиле (Mini App и бот) вместо реальной аватарки пользователя Telegram показывается заглушка — цветная точка в круге. Это выглядит незавершённым и снижает доверие к приложению.

## What Changes

- **Mini App ProfileScreen**: заменить декоративную заглушку (12px точка) на реальную фотографию профиля Telegram пользователя; fallback при отсутствии фото
- **Bot `/profile`**: добавить отправку фото профиля через `replyWithPhoto` вместе с текстовыми данными
- **DB users table**: добавить колонку `photo_file_id` для хранения file_id фото
- **API `/api/me`**: добавить поле `photoUrl: string | null` для Mini App
- **Bot `/start`**: при старте запрашивать `getUserProfilePhotos`, сохранять file_id в БД

## Capabilities

### New Capabilities
- `telegram-avatar-fetch`: Получение и кэширование file_id фотографии профиля пользователя Telegram через `getUserProfilePhotos` при `/start`; сохранение в SQLite
- `mini-app-avatar-display`: Отображение реальной аватарки Telegram в Mini App ProfileScreen; graceful fallback при отсутствии фото
- `bot-avatar-display`: Отправка фотографии профиля в ответ на команду `/profile` в Telegram боте

### Modified Capabilities
- `user-profile-api`: Расширение `/api/me` новым опциональным полем `photoUrl` (обратно совместимо)

## Impact

- **Code surfaces**: `server/db.ts`, `server/access/users-store.ts`, `server/bot/index.ts`, `server/api/routes.ts`, `server/bot/shop.ts`, `miniapp/src/screens/ProfileScreen.tsx`, `miniapp/src/lib/api.ts`
- **APIs / contracts**: `/api/me` — новое поле `photoUrl: string | null` (обратно совместимо)
- **Dependencies**: нет новых npm-пакетов (используются существующие методы grammy)
- **Systems / data**: SQLite миграция (новая колонка `photo_file_id` в `users`)
- **Risk notes**: `getUserProfilePhotos` может вернуть пустой массив; запрос только при `/start` (не чаще, rate limit); URL через `getFile` содержит токен бота
