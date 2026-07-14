## Why

Mini-app плеер не имеет регулировки громкости — ни ползунка, ни кнопки mute. Пользователь не может управлять уровнем звука, приходится регулировать громкость на устройстве или через наушники.

## What Changes

- Добавить ползунок громкости в `PlayerBar` (между информацией о треке и прогресс-баром, либо компактно справа)
- Добавить состояние громкости и mute в `PlayerProvider` (через `audio.volume`)
- Добавить иконку динамика с состоянием (громко / тихо / mute), которая открывает ползунок или работает как toggle mute
- Сохранять выбранный уровень громкости в `localStorage` (персистентность между сессиями)

## Capabilities

### New Capabilities
- `volume-control`: управление громкостью плеера — ползунок, mute-toggle, персистентность уровня в `localStorage`

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- **`miniapp/src/lib/player.tsx`**: добавить `volume` (0–1) в `PlayerState`, `setVolume(v)`, `toggleMute()` в `PlayerApi`; управлять `audio.volume`
- **`miniapp/src/components/PlayerBar.tsx`**: добавить UI для громкости (иконка + ползунок)
- **`miniapp/src/styles/glass.css`**: стили для ползунка громкости (кастомный range input в стиле glass)
- **Зависимости**: `@phosphor-icons/react` уже есть — использовать `SpeakerHigh`, `SpeakerLow`, `SpeakerX` для иконок
