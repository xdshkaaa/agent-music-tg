## Why

Бар-компоненты (BottomNav, PlayerBar, AdminSettingsBar) выглядят функционально, но визуально устарели на фоне остального glass-дизайна приложения. Отсутствует единая liquid-glass эстетика: плавные переходы активного индикатора, стеклянные поверхности с глубиной, анимированные акценты. Это снижает премиальность восприятия Mini App.

## What Changes

- **BottomNav.dock** — заменить сплошной фон `.dock` на полноценный liquid-glass с `backdrop-filter: blur()` и gradient-подсветкой
- **BottomNav active indicator** — добавить анимированный «жидкий» индикатор активной вкладки (morphing pill), который плавно перетекает между табами
- **PlayerBar** — усилить liquid-glass эстетику: animation glow, gradient border, микро-взаимодействия при наведении/перетаскивании прогресса
- **AdminSettingsBar** — привести к единому стилю с BottomNav (скругления, glass-фон, анимации)
- **CSS-переменные** — добавить токены liquid-glass (animated gradient border, glow shadow, morphing transition)
- **Анимации** — добавить `@keyframes` для пульсации/градиента/морфинга

## Capabilities

### New Capabilities
- `liquid-glass-bar`: Единая система liquid-glass стилизации для всех бар-компонентов: BottomNav, PlayerBar, AdminSettingsBar. Включает CSS-токены, анимации, анимированный индикатор активной вкладки.

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- `miniapp/src/styles/glass.css` — новые CSS-переменные и keyframes
- `miniapp/src/components/BottomNav.tsx` — structural changes for animated indicator
- `miniapp/src/components/PlayerBar.tsx` — glass enhancement + animation classes
- `miniapp/src/components/AdminSettingsBar.tsx` — visual alignment
- No API/backend changes
- No new dependencies
