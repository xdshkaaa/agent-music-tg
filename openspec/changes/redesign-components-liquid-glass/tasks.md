## 1. CSS-система liquid glass

- [ ] 1.1 Определить CSS custom properties для glass-эффектов в `:root` (`--glass-blur-subtle`, `--glass-blur-regular`, `--glass-blur-prominent`, `--glass-bg-opacity`, `--glass-tint-color`, `--glass-tint-opacity`, `--glass-highlight`, `--glass-shadow-sm`, `--glass-shadow-md`, `--glass-shadow-lg`, `--glass-transition`, `--glass-transition-morph`)
- [ ] 1.2 Создать базовый класс `.glass-surface` с общими glass-стилями (backdrop-filter, border, highlight ::before, overflow: hidden)
- [ ] 1.3 Создать модификаторы тона: `.glass-regular`, `.glass-subtle`, `.glass-prominent`, `.glass-tinted`
- [ ] 1.4 Создать стили для `[data-interactive]` (hover scale(1.02), active scale(0.97), focus-visible, transition)
- [ ] 1.5 Адаптировать светлую тему `[data-scheme="light"]` для всех новых переменных и классов
- [ ] 1.6 Переопределить `.glass-panel` через `.glass-surface.glass-regular`, пометить как deprecated комментарием
- [ ] 1.7 Переопределить `.dock-inner`, `.player-bar`, `.player-screen` через `.glass-surface.glass-regular`, пометить как deprecated
- [ ] 1.8 Добавить `prefers-reduced-motion: reduce` для отключения transform-анимаций

## 2. GlassPanel — расширение компонента

- [ ] 2.1 Добавить проп `tone?: "regular" | "subtle" | "prominent" | "tinted"` с дефолтом `"regular"`
- [ ] 2.2 Добавить проп `interactive?: boolean` — при true рендерит `data-interactive`
- [ ] 2.3 Добавить проп `as?: "div" | "button"` — при `"button"` рендерит `<button type="button">`, сохраняя все стили
- [ ] 2.4 Маппинг пропсов в CSS-классы: tone → `.glass-{tone}`, базовый `.glass-surface`
- [ ] 2.5 Обновить все использования `<GlassPanel>` в screens/components с передачей tone где нужно

## 3. BottomNav — glass dock с морфингом

- [ ] 3.1 Убедиться что `.dock-inner` использует `.glass-surface.glass-regular`
- [ ] 3.2 Активный таб получает `background: var(--accent-bg)` и `color: var(--accent)` с transition `--glass-transition-morph`
- [ ] 3.3 Неактивные табы — прозрачный фон, muted цвет
- [ ] 3.4 Заменить inline active-логику на классы с CSS transition

## 4. Segmented — tinted glass indicator

- [ ] 4.1 Добавить класс `.segmented-indicator-tinted` или использовать `.glass-tinted` через проп
- [ ] 4.2 Indicator получает `background: var(--accent-bg)` и border `var(--accent)` при активной опции
- [ ] 4.3 Убедиться что transition позиции использует `--glass-transition-morph`

## 5. PlayerBar — интерактивный glass mini-player

- [ ] 5.1 Убедиться что `.player-bar` наследует `.glass-surface.glass-regular`
- [ ] 5.2 Добавить `data-interactive` на `.player-bar` (уже есть role="button")
- [ ] 5.3 Прогресс-бар: animated fill с glass-треком (background с `--glass-blur-subtle`)
- [ ] 5.4 Volume slider: glass-трек с accent fill

## 6. VolumeControl — glass slider

- [ ] 6.1 Обновить `.volume-slider::-webkit-slider-runnable-track` под glass-стиль (blur, border)
- [ ] 6.2 Добавить glow на thumb при hover (box-shadow с accent-цветом)
- [ ] 6.3 Использовать `--glass-transition` для thumb transform

## 7. TrackSkeleton — glass shimmer

- [ ] 7.1 Обновить `.skeleton-box` gradient под glass-эстетику (более плавный переход цвета)
- [ ] 7.2 Использовать переменные `--glass-bg-dark`/`--glass-bg-light` в gradient

## 8. PlayerScreen — слоистый glass overlay

- [ ] 8.1 Убедиться что `.player-screen` использует `.glass-surface.glass-prominent`
- [ ] 8.2 Обновить `.player-screen-overlay` background на `rgba(0,0,0,0.5)` + backdrop-filter (уже есть)
- [ ] 8.3 Controls секция: tinted glass для группы кнопок
- [ ] 8.4 Прогресс-бар: glass-трек с accent fill

## 9. ErrorBanner — glass alert

- [ ] 9.1 Использовать `tone="tinted"` для GlassPanel в ErrorBanner (красный tint при error)
- [ ] 9.2 Кнопка "Повторить" использует `glass-button.primary`

## 10. AdminSettingsBar — glass admin panel

- [ ] 10.1 Обновить GlassPanel в AdminSettingsBar с tone="subtle"
- [ ] 10.2 Segmented внутри использует glass-interactive состояния

## 11. ProfileScreen — glass status cards

- [ ] 11.1 Профиль-карточка: GlassPanel с tone="regular"
- [ ] 11.2 Статистика (баланс, подписка): GlassPanel с tone="subtle"
- [ ] 11.3 Status card (после покупки): tinted glass с зелёным tint

## 12. BuyScreen — glass offer cards

- [ ] 12.1 Offer card: GlassPanel с tone="regular", interactive (если кликабельно)
- [ ] 12.2 Trial card: GlassPanel с tone="tinted" (accent-подсветка)
- [ ] 12.3 Search/фильтры: glass-input с focus glow

## 13. Финальная проверка

- [ ] 13.1 Проверить все компоненты на консистентность glass-стилей
- [ ] 13.2 Проверить светлую/тёмную тему
- [ ] 13.3 Проверить prefers-reduced-motion
- [ ] 13.4 `bun run build:miniapp` — сборка без ошибок
