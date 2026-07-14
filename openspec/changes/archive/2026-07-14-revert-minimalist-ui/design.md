## Context

`minimalist-ui-refactor` переписал `glass.css` на плоскую тёплую монохромную палитру, убрал `backdrop-filter`, glass-тени, фиолетовый акцент и Inter Tight. UI стал плоским и серым.

Возвращаем liquid-glass визуальную систему. База — оригинальный glass-стиль (темный фон `#0A0A0B`, `backdrop-filter`, прозрачные поверхности) + улучшенные многослойные тени из `liquid-glass-miniapp-ui`.

## Goals / Non-Goals

**Goals:**
- Тёмная тема `#0A0A0B` с фиолетовым акцентом `#a855f7`
- `backdrop-filter: blur(24px) saturate(160%)` на панелях, кнопках, инпутах
- Многослойные inset-тени (resting, active, indicator)
- Радиальный градиент на фоне с фиолетовым отливом
- Light theme override для всех токенов
- Inter Tight шрифт

**Non-Goals:**
- Не меняем структуру компонентов, их пропсы или поведение
- Не трогаем сервер, бот, платежи
- Не заменяем emoji (остаются Phosphor иконки)

## Decisions

1. **Структура CSS сохранена** — все классы из `minimalist-ui-refactor` (spacing utilities, screen-specific extraction, dock, player, segmented) остаются. Меняются только визуальные токены и их применения.

2. **Фиолетовый акцент** — `#a855f7` для `--accent`, `#7C3AED` для `--accent-deep`. Градиент на primary-кнопках: `linear-gradient(135deg, var(--accent), var(--accent-deep))`.

3. **Light scheme** — те же токены с меньшей контрастностью, мягкими переходами. Фон `#F5F5F7`.

4. **Inter Tight** — подключён через Google Fonts, используется как `--font-display`.

## Risks / Trade-offs

- **Производительность** — `backdrop-filter` на многих элементах может тормозить на слабых Android WebView. *Mitigation: используется только `blur(24px)` без `saturate` на кнопках/инпутах (12px), эффект статичный, без per-frame перерисовки.*
- **Light theme читаемость** — многослойные тени могут выглядеть грязно на светлом фоне. *Mitigation: dedicated light-scheme token overrides с reduced-opacity highlights.*
