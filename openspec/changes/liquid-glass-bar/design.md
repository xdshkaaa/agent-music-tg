## Context

Mini App имеет работающую glass-систему (glass.css) с `backdrop-filter`, полупрозрачными фонами, CSS-переменными. Однако бар-компоненты (BottomNav, PlayerBar, AdminSettingsBar) используют устаревшие сплошные фоны и не имеют единой liquid-glass эстетики:

- `.dock` — сплошной `background: #0A0A0B`, border-top, без glass-эффекта на внешнем контейнере
- `.dock-tab.active` — просто `background: var(--accent-bg)`, нет анимированного индикатора
- `PlayerBar` — уже glass, но без анимированных акцентов (glow, gradient border)
- `AdminSettingsBar` — использует GlassPanel, но визуально не согласован с BottomNav

Текущий glass-дизайн уже включает: `GlassPanel.tsx`, `.glass-panel`, `.glass-button`, `.glass-input`, `.segmented` — всё с backdrop-filter. Задача — поднять эстетику бара до уровня liquid-glass.

## Goals / Non-Goals

**Goals:**
- Liquid-glass стилизация `.dock`: прозрачный фон + backdrop-filter, убрать сплошной цвет
- Анимированный «жидкий» индикатор активной вкладки в BottomNav (морфинг-пилл)
- Liquid-glass подсветка PlayerBar (glow-анимация по градиентной границе)
- Единые CSS-токены liquid-glass (gradient border, glow shadow, morphing transition durations)
- Анимации: morphing indicator pulse, gradient border rotate, glow keyframes
- Согласование AdminSettingsBar с новым стилем

**Non-Goals:**
- Не менять API компонентов (пропсы, типы)
- Не трогать логику плеера, навигации, админских контролов
- Не переписывать существующую glass-систему — только добавлять новые токены
- Не менять ScreenTransition или другие компоненты вне баров
- Не добавлять новые зависимости

## Decisions

1. **Анимированный индикатор вместо `background` на `.dock-tab.active`**
   - Текущий подход: каждый `.dock-tab.active` красится в `var(--accent-bg)`.
   - Решение: добавить `<div className="dock-indicator" />` с `position: absolute`, который через `transform: translateX()` и `width` анимируется между табами.
   - Альтернатива: CSS `view-transition` API — менее контролируемо, хуже support.
   - Итог: JS-управляемый indicator с CSS transition (cubic-bezier morphing).

2. **Liquid-glass `.dock` вместо сплошного фона**
   - Текущий подход: `background: #0A0A0B` на `.dock`.
   - Решение: убрать сплошной фон, использовать `backdrop-filter: blur(24px) saturate(160%)`, сохранить border-top для визуального отделения от контента.
   - Риск: на слабых устройствах backdrop-filter может тормозить → добавить `will-change: backdrop-filter` только где нужно.

3. **Gradient border animation для PlayerBar**
   - Решение: `conic-gradient` border через `@property` + `@keyframes rotate`. Использовать псевдо-элемент `::before` с `mask: conic-gradient(...)`.
   - Альтернатива: border-image с анимацией — менее стабильно в WebKit.
   - Итог: псевдо-элемент с animated conic-gradient, `mask` для обрезания border, `pointer-events: none`.

4. **CSS-токены liquid-glass**
   - Добавить в `:root`:
     - `--liquid-glow`: `0 0 20px var(--accent)` для PlayerBar
     - `--liquid-border-gradient`: `conic-gradient(from var(--angle), ...)` 
     - `--liquid-morph-duration`: `0.35s`
     - `--liquid-morph-easing`: `cubic-bezier(0.34, 1.56, 0.64, 1)`

5. **AdminSettingsBar — только визуальное выравнивание**
   - Использовать те же CSS-переменные, что и BottomNav.
   - Синхронизировать `border-radius`, паддинги, тени.

## Risks / Trade-offs

- **[Performance] `backdrop-filter` на `.dock`** — может вызывать дрожание при скролле на iOS Safari. → mitigation: использовать `will-change: transform` на `.dock`, тестировать на реальных устройствах.
- **[Complexity] Анимированный индикатор** — добавляет JS-логику в BottomNav. → mitigation: минимум кода (ref + style transform), без библиотек.
- **[GPU] Gradient border animation** — может потреблять GPU на старых устройствах. → mitigation: `prefers-reduced-motion` отключает анимацию.
