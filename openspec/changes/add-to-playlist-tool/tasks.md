## 1. База данных

- [x] 1.1 `server/db.ts`: миграция `ALTER TABLE generations ADD COLUMN tracks_json TEXT;` в блоке try/catch рядом с существующими.
- [x] 1.2 `server/access/generations-store.ts`: `insertGeneration` возвращает `number` (lastInsertRowid); добавить `tracks: Track[]` в `GenerationRow`/`GenerationRowRaw` (парсинг `tracks_json`); `getGeneration(db, chatId, id)`; `appendTracksToGeneration(db, id, tracks, name?)`.

## 2. Агент-инструмент `add_to_playlist`

- [x] 2.1 `server/agent/tools.ts`: добавить `addToPlaylistSpec` (параметр `tracks`) и включить в `MUSIC_AGENT_TOOLS`.

## 3. Цикл генерации (extend-режим)

- [x] 3.1 `server/core/generate-playlist.ts`: добавить `mode`/`baseTracks`/`baseName`/`systemPrompt` в `GeneratePlaylistOptions`; аккумулятор `addedTracks`; обработка вызова `add_to_playlist` (парсинг + дедуп + tool-сообщение с прогрессом).
- [x] 3.2 `resolveAndFinalize`: принимать полный список (база ∪ добавления ∪ finalize.tracks), не бросать `NoTracksResolvedError`, если итог не пуст за счёт базы; выбор имени `args.name || baseName`.
- [x] 3.3 `server/agent/prompts.ts`: `buildExtendSystemPrompt(existingName, existingTracks)`.

## 4. Точка входа и API

- [x] 4.1 `server/core/run-generation.ts`: `extendGeneration(db, chatId, generationId, prompt, onEvent?)` (проверка доступа/владения, загрузка базы, генерация в extend-режиме, `appendTracksToGeneration`, `consumeAccess`, `fireVerification`); `startGeneration`/`resumeGeneration` пишут `tracks_json` и возвращают `generationId` в `outcome.ok`; добавить `generationId` в `GenerationOutcome.ok`.
- [x] 4.2 `server/api/routes.ts`: `POST /generate/extend` и `POST /generate/extend/stream`; существующие эндпоинты `/generate`…`/resume/stream` возвращают `generationId`.

## 5. Mini App (триггер)

- [x] 5.1 `miniapp/src/lib/api.ts`: `GenerateOutcome.ok` + `generationId`; `extendStream(generationId, prompt, onEvent)`.
- [x] 5.2 `miniapp/src/screens/ResultsScreen.tsx`: хранить `generationId`, добавить действие «Добавить треки» (ввод запроса → стрим `extendStream` → слить `playlist.tracks` в отображаемый список).

## 6. Тесты и проверка

- [x] 6.1 `server/access/generations-store.test.ts`: `getGeneration`, `appendTracksToGeneration`, парсинг `tracks_json`, возврат id.
- [x] 6.2 `server/core/generate-playlist.test.ts`: extend-режим (add_to_playlist копит, финализация объединяет с базой, дедуп, не падает при пустых добавлениях).
- [x] 6.3 `server/api/generate-stream.test.ts`: добавить мок `extendGeneration`.
- [x] 6.4 `bun run typecheck` (без новых ошибок в изменённых файлах) и `bun test` (новые тесты зелёные; pre-existing падения в avatar/openspec-commit/audio не связаны с изменением).
