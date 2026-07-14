## Context

Frontend — Vite + React 18, plain CSS с custom properties, без CSS-in-JS. Существующий `glass.css` (1781 строк) содержит классы `.glass-panel`, `.glass-button`, `.glass-input`, `.segmented`, `.player-bar`, `.dock-inner`, `.player-screen` и др., каждый с ручным дублированием backdrop-filter, box-shadow и border. Нет единой системы — blur-значения, тени, цвета размазаны по файлу.

Liquid Glass Design требует:
1. Систему CSS-переменных для glass-слоёв (толщина blur, tint, opacity, shadow depth)
2. Модификаторы `.glass-{tone}` вместо дублирования в каждом компоненте
3. Интерактивные состояния (:hover, :active, :focus-visible) с микроанимациями
4. Анимацию морфинга glass-эффектов для dock и segmented

## Goals / Non-Goals

**Goals:**
- Ввести единую систему CSS-переменных `--glass-blur-*`, `--glass-tint-*`, `--glass-depth-*`
- Создать модификаторы `.glass-{tone}` (regular, subtle, prominent, tinted)
- Обновить GlassPanel с пропсами `tone`, `interactive`, `as`
- Добавить интерактивные состояния (hover scale 1.02, glow, active scale 0.97)
- Реализовать morphing dock (анимация переключения табов через CSS transition групп)
- Сегментированный контроль с tinted glass indicator
- Glass-прогресс/громкость с анимированным fill
- Glass-скелетоны с shimmer-анимацией
- Адаптировать все экраны под единую glass-систему
- Поддержка light/dark схем через `[data-scheme]`

**Non-Goals:**
- Не менять логику компонентов (state, effects, API-вызовы)
- Не добавлять новые зависимости
- Не переписывать архитектуру (React Context, routing)
- Не трогать серверную часть (`server/`)

## Decisions

1. **CSS custom properties vs CSS-in-JS** — оставляем CSS custom properties. Проект использует plain CSS, нет смысла вводить рантайм-решение. Все новые переменные добавляем в `:root` в `glass.css`.

2. **Единый модификатор `.glass-{tone}` вместо отдельных классов** — вместо `.glass-panel`, `.dock-inner`, `.player-bar` (дублирующих backdrop-filter) вводим один базовый `.glass` с модификаторами тона. Старые классы оставляем для обратной совместимости, маркируем как deprecated.

3. **Tint через CSS-переменную `--glass-tint-color`** — tint задаётся не отдельным классом, а переменной `--glass-tint-color`. Это позволяет компонентам (Segmented, Dock) динамически менять оттенок без создания N CSS-классов. Светлая тема: tint-цвета становятся более прозрачными.

4. **Интерактивность через data-атрибут `[data-interactive]`** — не добавляем CSS-класс `.glass-interactive`, а используем data-атрибут. Это чище: интерактивность — поведение, а не стиль. Компонент `GlassPanel` рендерит `data-interactive` когда передан проп `interactive`.

5. **Morphing через CSS transition с кастомными easing** — используем `cubic-bezier(0.16, 1, 0.3, 1)` (Apple spring-like). Для dock: transition на backdrop-filter, background-color, box-shadow при переключении таба.

6. **Структура стекла: три слоя** — каждый glass-элемент получает: backdrop-filter (фон), linear-gradient overlay (блик), box-shadow (глубина). Это даёт эффект "жидкого стекла".

7. **Blur-уровни** — regular (24px), subtle (12px), prominent (36px). Каждый компонент выбирает подходящий.

## Risks / Trade-offs

- [Производительность] backdrop-filter на мобильных устройствах может тормозить → ограничить количество glass-элементов на экране (не более 5-6), использовать `will-change: transform` только для активных анимаций
- [Сложность рефакторинга] замена `.player-screen`, `.dock-inner` и т.д. может затронуть 12+ компонентов → делать постепенно, один компонент за раз, тестировать визуально
- [Light theme] стеклянные эффекты на светлом фоне выглядят иначе → использовать более плотный background (0.6–0.7 opacity) и тени с меньшей контрастностью
- [Регрессия] изменение CSS-классов может сломать существующие стили → все изменения каскадные, старые классы сохраняются как fallback
