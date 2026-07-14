## Context

Track rows в ResultsScreen показывают `TrackPlayButton` (play/pause) и сразу справа — иконку внешней ссылки (`ArrowSquareOut`) с `deepLink` на YouTube Music. Клик по ней открывает YouTube в новой вкладке, уводя пользователя из Mini App. Аудио и так воспроизводится через встроенный плеер (сервер стримит через `/api/stream/`), поэтому внешняя ссылка избыточна.

## Goals / Non-Goals

**Goals:**
- Убрать иконку внешней ссылки (YouTube Music) из каждой строки трека в ResultsScreen
- Оставить `deepLink` в типах и на бэкенде нетронутым (используется в Telegram-ответах бота)

**Non-Goals:**
- Не менять серверную часть, типы, PlayerBar, PlayerScreen, ProfileScreen
- Не менять CSS (класс `.icon-btn` остаётся для других иконок)

## Decisions

1. **Удалить JSX целиком, а не скрыть CSS** — код ссылки не нужен, проще удалить, чем поддерживать мёртвый код.
2. **Не трогать `deepLink`** — `deepLink` всё ещё используется в `server/core/run-generation.ts` для форматирования ответов бота. Удаление поля из `Track` сломает бота.
3. **Оставить импорт `ArrowSquareOut` только если он используется ещё где-то** — проверить grep перед удалением импорта.

## Risks / Trade-offs

- Если `ArrowSquareOut` импортится только в этом месте, удаление без проверки сломает сборку. → Проверить `grep -r ArrowSquareOut` перед удалением строки импорта.
