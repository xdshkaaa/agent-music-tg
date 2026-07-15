## 1. Server: record bot auto-audio in downloads history

- [x] 1.1 В `server/bot/auto-audio.ts` импортировать `insertDownload`, `setDownloadTracks`, `setDownloadStatus`, `finalStatusFor` из `../audio/downloads-store`
- [x] 1.2 В начале `deliverAutoAudio` создать запись через `insertDownload(db, chatId, playlistName, tracks)` и сохранить `DownloadRecord`
- [x] 1.3 В цикле доставки после каждого трека обновлять `record.tracks[i].status` (`sent`/`failed`) и вызывать `setDownloadTracks(db, record.id, tracks)`
- [x] 1.4 Помечать треки со статусом `unavailable` (пропущенные) как `failed` с `error: "недоступен"` в записи
- [x] 1.5 После цикла вызвать `setDownloadStatus(db, record.id, finalStatusFor(tracks))`
- [x] 1.6 Обернуть тело в try/catch: при внешнем сбое ставить статус `failed`, чтобы запись не зависала в `pending`

## 2. Tests

- [x] 2.1 В `server/audio/audio.test.ts` добавить тест: вызов `deliverAutoAudio` создаёт ровно одну запись `downloads` для `chatId` (проверить через `listDownloads`)
- [x] 2.2 Проверить итоговый статус записи (`done` при всех sent, `failed` при всех failed) и per-track статусы
- [x] 2.3 Проверить, что пропущенный `unavailable` трек помечен `failed`, а остальные — `sent`, и статус `partial`

## 3. Verification

- [x] 3.1 `bun test` — новые тесты `deliverAutoAudio` проходят; регрессий от этого изменения нет (3 упавших теста в репозитории — openspec-тулчейн, перечисляющий каталог changes — и typecheck-ошибки в `admin-panel.ts`/`payments.test.ts` предсуществуют и не относятся к этому изменению, проверено через stash)
- [x] 3.2 `bun run typecheck` — изменённые файлы (`auto-audio.ts`, `audio.test.ts`) без ошибок типов; предсуществующие ошибки вне scope этого изменения
- [ ] 3.3 Ручная проверка: сгенерировать плейлист в боте, открыть мини-приложение → «Загрузки», убедиться, что запись появилась с корректным статусом и треками (требует живого бота/деплоя)
