## Context

Сервер возвращает `artwork?: string` (URL обложки) для каждого трека через API (`POST /generate`). Клиентский тип `Track` в `api.ts` уже содержит это поле. Однако `PlayerTrackInfo` (внутренний тип плеера) не имеет поля `artwork`, и все точки входа в плеер (`ResultsScreen`, `ProfileScreen`) отбрасывают `artwork` при передаче данных.

Полноэкранный плеер (`PlayerScreen`) рендерит статический CSS-плейсхолдер. Мини-плеер (`PlayerBar`) вообще не имеет элемента для обложки. `MediaSession` API всегда использует fallback SVG.

## Goals / Non-Goals

**Goals:**
- Добавить поле `artwork` в `PlayerTrackInfo`
- Передавать URL обложки из экранов в плеер
- Отображать обложку в `PlayerScreen` (крупно, по центру)
- Отображать миниатюру обложки в `PlayerBar`
- Обновить `MediaSession` с реальной обложкой
- Graceful fallback при отсутствии/ошибке загрузки обложки

**Non-Goals:**
- Встраивание обложек в аудиофайлы при скачивании (не относится к плееру)
- Кэширование обложек на клиенте (браузер кэширует сам)
- Анимации при смене обложки

## Decisions

1. **`artwork?: string` в `PlayerTrackInfo`** — минимальное изменение типа, `setQueue` и `toggle` уже принимают `PlayerTrackInfo[]` и `PlayerTrackInfo`.
2. **`onError` на `<img>` для fallback** — вместо CSS-`background-image` используем `<img>` с `onError={handleImgError}`, чтобы поймать битые URL. При ошибке показываем тот же CSS-плейсхолдер.
3. **`preload="none"` для изображения в PlayerScreen** — обложка не критична для загрузки страницы, можно lazy load (`loading="lazy"`).
4. **MediaSession: обложка через `fetch` + `URL.createObjectURL`** — `MediaMetadata` принимает `Blob`, не URL. Если URL — картинка с другого origin (CDN SoundCloud/YouTube), нужно скачать её через `fetch()` и создать object URL.
5. **PlayerBar: маленькая круглая миниатюра** — 36×36px, `border-radius: 8px`, слева от информации о треке.

## Risks / Trade-offs

- **[Cross-origin MediaSession]** Некоторые CDN могут не отдавать CORS-заголовки → `fetch()` упадёт → MediaSession получит fallback. *Mitigation:* fallback на SVG, ошибка тихая.
- **[Битые SSL/CDN]** URL обложки с YouTube/SoundCloud могут протухать. *Mitigation:* `onError` на `<img>` и try/catch на `fetch()` для MediaSession.
- **[Performance]** fetch обложки для MediaSession — дополнительный запрос. *Mitigation:* делаем только при смене трека, не критично для UX.
