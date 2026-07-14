## 1. CSS-система liquid glass

- [x] 1.1 Определить CSS custom properties для glass-эффектов в `:root` (`--glass-blur-subtle`, `--glass-blur-regular`, `--glass-blur-prominent`, `--glass-bg-opacity`, `--glass-tint-color`, `--glass-tint-opacity`, `--glass-highlight`, `--glass-shadow-sm`, `--glass-shadow-md`, `--glass-shadow-lg`, `--glass-transition`, `--glass-transition-morph`)
- [x] 1.2 Создать базовый класс `.glass-surface` с общими glass-стилями (backdrop-filter, border, highlight ::before, overflow: hidden)
- [x] 1.3 Создать модификаторы тона: `.glass-regular`, `.glass-subtle`, `.glass-prominent`, `.glass-tinted`
- [x] 1.4 Создать стили для `[data-interactive]` (hover scale(1.02), active scale(0.97), focus-visible, transition)
- [x] 1.5 Адаптировать светлую тему `[data-scheme="light"]` для всех новых переменных и классов
- [x] 1.6 Переопределить `.glass-panel` через `.glass-surface.glass-regular`, пометить как deprecated комментарием
- [x] 1.7 Переопределить `.dock-inner`, `.player-bar`, `.player-screen` через `.glass-surface.glass-regular`, пометить как deprecated
- [x] 1.8 Добавить `prefers-reduced-motion: reduce` для отключения transform-анимаций

## 2. GlassPanel — расширение компонента

- [x] 2.1 Добавить проп `tone?: "regular" | "subtle" | "prominent" | "tinted"` с дефолтом `"regular"`
- [x] 2.2 Добавить проп `interactive?: boolean` — при true рендерит `data-interactive`
- [x] 2.3 Добавить проп `as?: "div" | "button"` — при `"button"` рендерит `<button type="button">`, сохраняя все стили
- [x] 2.4 Маппинг пропсов в CSS-классы: tone → `.glass-{tone}`, базовый `.glass-surface`
- [x] 2.5 Обновить все использования `<GlassPanel>` в screens/components с передачей tone где нужно

## 3. BottomNav — glass dock с морфингом

- [x] 3.1 Убедиться что `.dock-inner` использует `.glass-surface.glass-regular`
- [x] 3.2 Активный таб получает `color: var(--accent)` с transition `--glass-transition-morph`
- [x] 3.3 Неактивные табы — прозрачный фон, muted цвет
- [x] 3.4 Заменить inline active-логику на классы с CSS transition

## 4. Segmented — tinted glass indicator

- [x] 4.1 Добавить класс `.segmented-indicator-tinted` и проп tinted в Segmented
- [x] 4.2 Indicator получает `background: var(--accent-bg)` и border `var(--accent)` при tinted
- [x] 4.3 Transition позиции использует `--glass-transition-morph`

## 5. PlayerBar — интерактивный glass mini-player

- [x] 5.1 Убедиться что `.player-bar` наследует `.glass-surface.glass-regular`
- [x] 5.2 Добавить `data-interactive` на `.player-bar`
- [x] 5.3 Прогресс-бар: glass-трек с анимированным fill (backdrop-filter, transition)
- [x] 5.4 Volume slider: glass-трек с accent fill

## 6. VolumeControl — glass slider

- [x] 6.1 Обновить `.volume-slider::-webkit-slider-runnable-track` под glass-стиль (blur)
- [x] 6.2 Добавить glow на thumb при hover (box-shadow с accent-цветом)
- [x] 6.3 Использовать `--glass-transition` для thumb transform

## 7. TrackSkeleton — glass shimmer

- [x] 7.1 Обновить `.skeleton-box` gradient под glass-эстетику
- [x] 7.2 Использовать переменные `--glass-bg-dark`/`--glass-bg-light` в gradient

## 8. PlayerScreen — слоистый glass overlay

- [x] 8.1 Убедиться что `.player-screen` использует `.glass-surface.glass-prominent`
- [x] 8.2 Обновить `.player-screen-overlay` background + backdrop-filter
- [x] 8.3 Controls секция: glass-поверхность с backdrop-filter
- [x] 8.4 Прогресс-бар: glass-трек с accent fill

## 9. ErrorBanner — glass alert

- [x] 9.1 Использовать `tone="tinted"` для GlassPanel в ErrorBanner (красный tint)
- [x] 9.2 Кнопка "Повторить" использует `glass-button.primary`

## 10. AdminSettingsBar — glass admin panel

- [x] 10.1 Обновить GlassPanel в AdminSettingsBar с tone="subtle"
- [x] 10.2 Segmented использует glass-interactive состояния

## 11. ProfileScreen — glass status cards

- [x] 11.1 Профиль-карточка: GlassPanel с tone="regular" (дефолт)
- [x] 11.2 Статистика: GlassPanel с tone="regular" (дефолт)
- [x] 11.3 Status card: tinted glass с зелёным tint (CSS класс .status-card)

## 12. BuyScreen — glass offer cards

- [x] 12.1 Offer card: GlassPanel с tone="regular" (дефолт)
- [x] 12.2 Trial card: GlassPanel с tone="tinted"
- [x] 12.3 Search/фильтры: glass-input с focus glow

## 13. Финальная проверка

- [x] 13.1 Проверить все компоненты на консистентность glass-стилей
- [x] 13.2 Проверить светлую/тёмную тему
- [x] 13.3 Проверить prefers-reduced-motion
- [x] 13.4 `bun run build:miniapp` — сборка без ошибок
