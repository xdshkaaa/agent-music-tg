## Why

В полноэкранном плеере и мини-плеере не отображается обложка альбома проигрываемого трека. Пользователь видит только декоративный плейсхолдер, хотя сервер возвращает `artwork` для каждого трека. Это ухудшает восприятие приложения и делает его незаконченным.

## What Changes

- Добавить поле `artwork?: string` в `PlayerTrackInfo` в `player.tsx`
- Передавать `artwork` при вызове `player.setQueue()` и `player.toggle()` из `ResultsScreen` и `ProfileScreen`
- Заменить статический плейсхолдер обложки в `PlayerScreen` на `<img>` с реальным URL обложки
- Обновить `MediaSession` metadata, чтобы на системном экране блокировки тоже отображалась обложка
- Добавить отображение миниатюры обложки в `PlayerBar` (мини-плеер)
- Добавить fallback-обработку битых/отсутствующих URL обложек

## Capabilities

### New Capabilities
- `album-artwork-player`: Отображение обложки альбома в полноэкранном плеере, мини-плеере и на системном экране блокировки (MediaSession)

### Modified Capabilities
*(нет изменений в существующих spec — только реализация)*

## Impact

- **miniapp/src/lib/player.tsx** — расширить `PlayerTrackInfo`, обновить `MediaSession`
- **miniapp/src/screens/PlayerScreen.tsx** — заменить плейсхолдер на `<img>`
- **miniapp/src/screens/ResultsScreen.tsx** — передавать `artwork` в плеер
- **miniapp/src/screens/ProfileScreen.tsx** — передавать `artwork` в плеер
- **miniapp/src/components/PlayerBar.tsx** — добавить миниатюру обложки
- **miniapp/src/styles/glass.css** — добавить/обновить CSS для новой обложки в плеере
