## Why

Сейчас агент собирает плейлист и финализирует его один раз (`finalize_playlist`), а таблица `generations` хранит только имя и количество треков. Дополнить уже готовый плейлист новыми треками невозможно: нет ни сохранённого списка треков, ни инструмента для добавления, ни точки входа в генерацию.

Пользователи часто хотят «добавить ещё 5 треков в тот же плейлист» после того, как он создан. Нужен механизм `add_to_playlist`, который расширяет ранее созданный плейлист (по его id) в рамках новой сессии генерации, работая с локальным списком треков (оба бэкенда resolve-only, реальных удалённых плейлистов нет).

## What Changes

- Добавляется агент-инструмент `add_to_playlist`: агент накапливает новые треки через него, затем финализирует расширенный плейлист.
- В цикл генерации добавляется режим `extend`: базовые треки плейлиста подаются как read-only контекст, итог = база ∪ добавления (с дедупликацией).
- Список треков генерации сохраняется в БД (`generations.tracks_json`), чтобы плейлист можно было загрузить и расширить позже.
- Появляется точка входа `extendGeneration` (и API `/generate/extend`, `/generate/extend/stream`), возвращающая `generationId`, чтобы Mini App мог предложить действие «Добавить треки».
- Mini App получает кнопку «Добавить треки» на экране результата, стримящую дополнение и сливающее треки в отображаемый список.

## Capabilities

### New Capabilities
- `playlist-extend`: расширение ранее созданного плейлиста через агент-инструмент `add_to_playlist` и режим `extend` цикла генерации, с сохранением треков в БД и пользовательским триггером в Mini App.

### Modified Capabilities
- (нет изменений на уровне spec существующих capabilities — поведение создания плейлиста не меняется, добавляется новое)

## Impact

- `server/db.ts` — миграция `generations.tracks_json`.
- `server/access/generations-store.ts` — `insertGeneration` возвращает id; `getGeneration`, `appendTracksToGeneration`, поле `tracks` в `GenerationRow`.
- `server/agent/tools.ts` — новый `add_to_playlist` spec + ветка в классификации.
- `server/agent/prompts.ts` — `buildExtendSystemPrompt`.
- `server/core/generate-playlist.ts` — `mode`/`baseTracks`/`baseName`/`systemPrompt` в опциях, аккумулятор `addedTracks`, слияние при финализации.
- `server/core/run-generation.ts` — `extendGeneration`, возврат `generationId` из create/resume/extend.
- `server/api/routes.ts` — `/generate/extend`, `/generate/extend/stream`; возврат `generationId` из существующих эндпоинтов.
- `miniapp/src/lib/api.ts`, `miniapp/src/screens/ResultsScreen.tsx` — триггер «Добавить треки».
- Тесты: `generations-store`, `generate-playlist` (extend), `generate-stream.test.ts`.
