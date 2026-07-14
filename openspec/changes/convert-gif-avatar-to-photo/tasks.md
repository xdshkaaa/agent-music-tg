## 1. Avatar conversion module

- [x] 1.1 Create `server/avatar.ts` — модуль с функциями `isAnimatedAvatar(filePath)` и `convertToStaticJpeg(filePath, fileUniqueId)`
- [x] 1.2 Реализовать `isAnimatedAvatar` — проверка расширения `.mp4`, `.mov`, `.gif` в `file_path`
- [x] 1.3 Реализовать `convertToStaticJpeg` — вызов `ffmpeg -i <input> -vframes 1 -q:v 2 <output>.jpg` через `child_process.exec`
- [x] 1.4 Добавить проверку наличия ffmpeg перед конвертацией, graceful fallback если нет
- [x] 1.5 Реализовать кеширование: сохранение JPEG в `data/avatars/<file_unique_id>.jpg`, проверка наличия перед конвертацией

## 2. Serve converted avatars

- [x] 2.1 Добавить express/hono роут `GET /avatar/:filename` на `data/avatars/` с `Content-Type: image/jpeg`
- [x] 2.2 Обработка 404 если файла нет

## 3. Integrate with `/api/me`

- [x] 3.1 В `routes.ts` после `getFile`: вызвать `isAnimatedAvatar` по `file_path`
- [x] 3.2 Если анимирован — проверить кеш, если нет — вызвать `convertToStaticJpeg`
- [x] 3.3 Вернуть URL на локальный `/avatar/<file_unique_id>.jpg` вместо Telegram CDN
- [x] 3.4 Если конвертация не удалась — вернуть `photoUrl: null`

## 4. Bot `/profile` fallback

- [x] 4.1 В `shop.ts:showProfile`: обернуть `replyWithPhoto` в try/catch
- [x] 4.2 При ошибке отправки фото — отправить только текст профиля

## 5. Tests

- [x] 5.1 Тесты для `isAnimatedAvatar`: MP4, MOV, GIF, JPG, PNG — корректное определение
- [x] 5.2 Тесты для `convertToStaticJpeg`: успешная конвертация, отсутствие ffmpeg, ошибка ffmpeg
- [x] 5.3 Тест для роута `/avatar/:filename`: 200 и 404
