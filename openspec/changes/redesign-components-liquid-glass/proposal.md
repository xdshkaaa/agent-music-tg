## Why

Существующий UI уже использует стеклянные эффекты (backdrop-filter), но они несистемны — каждый компонент определяет glass-стили независимо. Liquid Glass Design привносит единую визуальную систему: градиентные подложки, tint-вариации для состояний (active/hover/disabled), morphing-анимации между состояниями, и слоистость через box-shadow. Это повышает визуальное качество, консистентность и премиальность интерфейса.

## What Changes

- **Единая система glass-переменных** — стандартизация blur-уровней (regular / prominent / subtle), tint-цветов, shadow-слоёв
- **Обновление GlassPanel** — пропсы `tone` (regular / tinted / prominent), `interactive`, `as` (позволяет рендерить как button/label)
- **Интерактивный glass** — hover/active-состояния с микроанимациями (scale, glow, яркость) для glass-кнопок, glass-панелей
- **Morphing dock** — анимация слияния/разделения glass-эффектов при смене табов (через CSS transition групп)
- **Glass-сегменты** — улучшенный `Segmented` с tinted glass для активной опции
- **Glass-прогресс/громкость** — стеклянные треки с animated fill
- **Glass-скелетоны** — shimmer с градиентным glass-эффектом
- **Glass-оверлей плеера** — слоистый glass с backdrop blur в несколько уровней
- **Screen-транзишены** — morphing между экранами через glass-переходы
- **Admin-панель** — tinted glass для статусной секции
- **Тёмная/светлая темы** — адаптация цветов glass под обе схемы
- **Удаление дублирующихся CSS-классов** — рефакторинг `.player-screen`, `.dock-inner`, `.player-bar` в единые glass-модификаторы
- **переработка `.player-screen`, `.dock-inner`, `.player-bar`** — замена на вариации `glass-panel` (BREAKING: удаление устаревших классов)

## Capabilities

### New Capabilities
- `glass-system`: единая система CSS-переменных и модификаторов для liquid glass (blur-уровни, tint, shadow, интерактивность)
- `glass-interactive`: интерактивные состояния glass-элементов (hover, active, focus) с микроанимациями
- `glass-morphing`: анимация морфинга glass-эффектов при переключении состояний (dock tabs, segmented)

### Modified Capabilities
<!-- No existing specs found in openspec/specs/ -->

## Impact

- `miniapp/src/styles/glass.css` — рефакторинг: систематизация переменных, добавление tone-модификаторов, удаление дубликатов
- `miniapp/src/components/GlassPanel.tsx` — расширение пропсов (tone, interactive, as)
- `miniapp/src/components/BottomNav.tsx` — glass dock с morphing-анимацией
- `miniapp/src/components/PlayerBar.tsx` — интерактивный glass mini-player
- `miniapp/src/components/Segmented.tsx` — tinted glass indicator
- `miniapp/src/components/VolumeControl.tsx` — glass slider track
- `miniapp/src/components/TrackSkeleton.tsx` — glass shimmer
- `miniapp/src/screens/PlayerScreen.tsx` — слоистый glass overlay
- `miniapp/src/screens/ProfileScreen.tsx` — glass status cards
- `miniapp/src/screens/BuyScreen.tsx` — glass offer cards
- `miniapp/src/components/ScreenTransition.tsx` — glass morphing
- Возможен рефакторинг 12+ компонентов
