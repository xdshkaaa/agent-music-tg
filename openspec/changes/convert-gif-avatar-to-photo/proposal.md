## Why

У пользователей Telegram может быть анимированная аватарка (видео/GIF). Telegram Bot API через `getUserProfilePhotos` возвращает `file_id`, который через `getFile` может указывать на MP4/GIF-файл. Браузер не отображает видео в `<img>`, а `replyWithPhoto` падает с ошибкой. Нужно детектить такие файлы и конвертировать в статичный JPEG.

## What Changes

- **Детекция формата**: после `getFile` проверять расширение/MIME файла (`.mp4`, `.mov`, `.gif` → нестатичный)
- **Конвертация в JPEG**: извлечение первого кадра из видео/GIF через ffmpeg, сохранение на диск
- **Кеширование**: сохранять сконвертированный JPEG рядом с оригиналом, переиспользовать при повторных запросах
- **Обработка ошибок**: если конвертация не удалась — показывать placeholder, не ломать профиль
- **Адаптация `/api/me`**: возвращать URL на сконвертированный JPEG вместо прямого Telegram URL
- **Адаптация `/profile` в боте**: fallback на текстовый профиль, если `replyWithPhoto` не сработал для анимированной аватарки

## Capabilities

### New Capabilities
- `animated-avatar-conversion`: детекция анимированных аватарок, конвертация видео/GIF в статичный JPEG, кеширование результата

### Modified Capabilities
<!-- No existing specs change — new capability only -->

## Impact

- **server/api/routes.ts**: логика построения `photoUrl` — добавить детекцию формата и конвертацию
- **server/bot/shop.ts**: `showProfile` — fallback при неудачной отправке фото
- **Новый файл**: `server/avatar.ts` — утилита детекции/конвертации аватарок
- **Зависимости**: ffmpeg (уже есть на VPS через `deploy.sh`), sharp или `child_process.exec` для ffmpeg
- **Директория**: `data/avatars/` — для хранения сконвертированных JPEG
