## Why

Композиция плеера (PlayerBar + PlayerScreen) не имеет чёткой иерархии: два слайдера (прогресс и громкость) визуально неотличимы, управление разбросано, крупные пустые промежутки разряжают внимание. Плеер воспринимается как набор виджетов, а не как цельный аудиоплеер. Liquid-glass эстетика сохраняется — меняется только компоновка.

## What Changes

- **PlayerBar**: перегруппировать элементы — вынести громкость на отдельную строку рядом с прогрессом, отделить от информации о треке
- **PlayerScreen**: сгруппировать кнопку play и регулятор громкости в единую панель управления, добавить тайминги на прогресс-бар (0:00 / 3:45)
- Убрать визуальную конкуренцию между двумя слайдерами (прогресс и громкость) через позиционирование и подписи/иконки
- Скорректировать отступы и gap для создания внятной иерархии
- Добавить время на прогресс-бар (текущее / общее)

## Capabilities

### New Capabilities
- `player-bar-layout`: композиция мини-плеера — расположение play-кнопки, информации о треке, прогресс-бара и регулятора громкости; логика двух строк
- `player-screen-layout`: композиция полноэкранного плеера — группировка контролов (play + volume как единый блок), прогресс-бар с таймингами, иерархия отступов

### Modified Capabilities
<!-- No existing spec requirements change — volume-control API and behaviour remain the same, only its layout position changes -->

## Impact

- **`miniapp/src/components/PlayerBar.tsx`**: новая разметка — перегруппировка play_info / progress / volume
- **`miniapp/src/screens/PlayerScreen.tsx`**: новая разметка — группировка контролов, добавление time labels на прогресс-бар
- **`miniapp/src/styles/glass.css`**: новые/изменённые стили для .player-bar, .player-screen-*, .player-progress (time labels), .volume-control placement
- **`miniapp/src/lib/player.tsx`**: минимальные изменения — экспозиция currentTime / duration для time labels (если ещё не доступны)
- **Зависимости**: без изменений
