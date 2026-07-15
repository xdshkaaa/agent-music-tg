## 1. Фильтрация списка

- [x] 1.1 В `ResultsScreen.tsx` добавить `visibleTracks = playlist.tracks.filter((t) => verification[t.uri] !== "unavailable")`
- [x] 1.2 Итерировать по `visibleTracks` вместо `playlist.tracks` при рендере строк треков (сохранить индекс для `--i` из `.map`)

## 2. Пустое состояние

- [x] 2.1 Когда `done.current && visibleTracks.length === 0` — показать сообщение «Все треки недоступны» вместо списка

## 3. Очистка мёртвого кода

- [x] 3.1 Убрать ветку `unavailable` в `handleTrackClick`
- [x] 3.2 Убрать проверку `verification[track.uri] === "unavailable"` в `TrackPlayButton onBeforePlay`
- [x] 3.3 Импорт `WarningCircle` ещё используется (toast / error-row) — оставлен

## 4. Проверка

- [x] 4.1 `cd miniapp && bun run build` — typecheck + build без ошибок
