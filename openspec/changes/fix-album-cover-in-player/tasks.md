## 1. Data layer: добавить artwork в PlayerTrackInfo

- [x] 1.1 Добавить поле `artwork?: string` в интерфейс `PlayerTrackInfo` в `miniapp/src/lib/player.tsx`
- [x] 1.2 Нет локального `PlayerTrackInfo` в `PlayerScreen.tsx` — пропущено
- [x] 1.3 Тип `PlayerTrackInfo` расширен — `setQueue()`/`toggle()` автоматически передают `artwork` через spread

## 2. ResultsScreen: передавать artwork в плеер

- [x] 2.1 В `ResultsScreen.tsx` добавлен `artwork: t.artwork` в `player.setQueue()`
- [x] 2.2 В `ResultsScreen.tsx` добавлен `artwork: track.artwork` в `player.toggle()` и `TrackPlayButton`

## 3. ProfileScreen: передавать artwork в плеер

- [x] 3.1 `DownloadTrack` не имеет поля `artwork` — изменений не требуется
- [x] 3.2 `DownloadTrack` не имеет поля `artwork` — изменений не требуется

## 4. PlayerScreen: отображать обложку

- [x] 4.1 Заменён плейсхолдер на `<img>` c `src={track.artwork}` и `loading="lazy"`
- [x] 4.2 Добавлен `onError` → `setArtworkError(true)` и условный рендеринг плейсхолдера
- [x] 4.3 Добавлен CSS `.player-screen-artwork-img` с `object-fit: cover`

## 5. PlayerBar: отображать миниатюру обложки

- [x] 5.1 Добавлен `<img className="player-bar-thumbnail">` в `PlayerBar.tsx`
- [x] 5.2 Добавлен `onError`, скрывающий миниатюру через `style.display = "none"`
- [x] 5.3 Добавлен CSS `.player-bar-thumbnail` (36×36px, `border-radius: 8px`, `object-fit: cover`)

## 6. MediaSession: установить реальную обложку

- [x] 6.1 Логика встроена в существующий `useEffect` MediaSession
- [x] 6.2 `fetch(artworkUrl)` → `blob()` → `URL.createObjectURL()` → `MediaMetadata.artwork`
- [x] 6.3 `artworkObjectUrlRef` хранит object URL, очищается при смене трека и в cleanup
- [x] 6.4 Вызывается при смене трека с `state.track.artwork`
- [x] 6.5 При ошибке fetch — fallback на `FALLBACK_ARTWORK`, ошибка тихая

## 7. Проверка и сборка

- [x] 7.1 `bun run dev` — ошибок, связанных с изменениями, нет
- [x] 7.2 `bun run typecheck` — ошибки только в `server/bot/admin-panel.ts` (pre-existing)
- [x] 7.3 `bun run build:miniapp` — Vite build завершён успешно
