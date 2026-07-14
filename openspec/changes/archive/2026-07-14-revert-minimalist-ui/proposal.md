## Why

`minimalist-ui-refactor` заменил жидкое стекло (liquid glass) на плоский тёплый монохром с пастельными акцентами. UI потерял премиальность, глубину и визуальный вес. Возвращаем liquid-glass визуальную систему: тёмная тема, фиолетовый акцент, `backdrop-filter`, многослойные тени, свечение.

## What Changes

- **BREAKING**: Удалить плоскую монохромную палитру (`--canvas: #F7F6F3`, `--card: #FFFFFF`, `--hairline: #EAEAEA`, muted pastel accents)
- Восстановить тёмную тему (`#0A0A0B`) с фиолетовым акцентом (`#a855f7`)
- Добавить `backdrop-filter: blur()` + `saturate()` на все поверхности (панели, кнопки, инпуты)
- Добавить токены слоистых теней: `--glass-shadow`, `--glass-shadow-active`, `--glass-shadow-indicator`
- Добавить утилитарные классы: `.glass`, `.glass-active`, `.glass-indicator`
- Восстановить `::before` highlight gradient на `.glass-panel`
- Вернуть Inter Tight шрифт
- Light/dark scheme override для всех токенов

## Capabilities

### New Capabilities
- `restore-liquid-glass`: CSS-токены, утилитарные классы, glass-эффекты на всех поверхностях, фиолетовый акцент, тёмная тема

### Modified Capabilities
- `minimalist-ui-refactor/visual-foundation` — полная замена на liquid-glass токены
- `minimalist-ui-refactor/component-system` — glass-эффекты вместо плоских поверхностей

## Impact

- `miniapp/src/styles/glass.css` — полная перезапись (структура сохранена, визуал — liquid glass)
- `miniapp/index.html` — подключён Inter Tight через Google Fonts
