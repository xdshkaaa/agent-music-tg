## ADDED Requirements

### Requirement: CSS переменные для liquid glass

Система SHALL определить CSS custom properties для всех glass-эффектов в `:root` в `miniapp/src/styles/glass.css`:

| Переменная | Назначение | Дефолтное значение |
|---|---|---|
| `--glass-blur-subtle` | Лёгкий blur | `8px` |
| `--glass-blur-regular` | Стандартный blur | `24px` |
| `--glass-blur-prominent` | Сильный blur | `36px` |
| `--glass-bg-opacity` | Прозрачность фона | `0.55` |
| `--glass-bg-light` | Цвет фона glass (light) | `rgba(255,255,255,var(--glass-bg-opacity))` |
| `--glass-bg-dark` | Цвет фона glass (dark) | `rgba(30,32,38,var(--glass-bg-opacity))` |
| `--glass-tint-color` | Цвет tint для tinted glass | `var(--accent)` |
| `--glass-tint-opacity` | Прозрачность tint overlay | `0.15` |
| `--glass-highlight` | Блик (верхний левый угол) | `rgba(255,255,255,0.35)` |
| `--glass-shadow-sm` | Малая тень | `inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.2)` |
| `--glass-shadow-md` | Средняя тень | `inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.3)` |
| `--glass-shadow-lg` | Глубокая тень | `inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.15), 0 8px 32px rgba(0,0,0,0.4)` |
| `--glass-transition` | Стандартный transition | `0.18s ease` |
| `--glass-transition-morph` | Transition для морфинга | `0.35s cubic-bezier(0.16,1,0.3,1)` |

#### Scenario: Переменные доступны в :root
- **WHEN** CSS файл загружен
- **THEN** все переменные определены в `:root` и доступны для использования в любом селекторе

#### Scenario: Переменные переопределяются для светлой темы
- **WHEN** `[data-scheme="light"]` установлен на `:root`
- **THEN** `--glass-bg-light` и `--glass-bg-dark` меняют opacity на 0.6, тени становятся мягче, `--glass-tint-opacity` уменьшается до 0.1

### Requirement: Модификаторы `.glass-{tone}`

Система SHALL предоставить CSS-модификаторы тона для glass-элементов:
- `.glass-regular` — стандартный glass с `--glass-blur-regular`, `--glass-shadow-md`
- `.glass-subtle` — лёгкий glass с `--glass-blur-subtle`, `--glass-shadow-sm`
- `.glass-prominent` — сильный glass с `--glass-blur-prominent`, `--glass-shadow-lg`
- `.glass-tinted` — как regular + overlay `var(--glass-tint-color)` при opacity `var(--glass-tint-opacity)`

#### Scenario: Применение модификатора
- **WHEN** элемент имеет класс `.glass-regular`
- **THEN** элемент получает `backdrop-filter: blur(var(--glass-blur-regular))`, тень `var(--glass-shadow-md)`, фон `var(--glass-bg-dark)`

#### Scenario: Glass-tinted overlay
- **WHEN** элемент имеет класс `.glass-tinted`
- **THEN** поверх фона добавляется `::before` с `background: var(--glass-tint-color)` при opacity `var(--glass-tint-opacity)`

### Requirement: Базовый класс `.glass-surface`

Система SHALL предоставить класс `.glass-surface`, который является общим для всех glass-элементов:
- `position: relative`
- `overflow: hidden` (для overlay)
- `border-radius: var(--radius-card)`
- `border: 1px solid var(--glass-border-dark)` / `var(--glass-border-light)`
- `backdrop-filter: blur(var(--glass-blur-regular))` saturate(160%)
- highlight `::before` с диагональным градиентом

#### Scenario: Все glass-элементы наследуют .glass-surface
- **WHEN** элемент имеет классы `.glass-surface.glass-regular`
- **THEN** применяются базовые стили поверхности + модификатор тона

### Requirement: Устаревшие классы-дубликаты

Система SHALL сохранить обратную совместимость: классы `.glass-panel`, `.dock-inner`, `.player-bar`, `.player-screen` переопределяются через миксин `.glass-surface.glass-regular` и помечаются комментарием `/* @deprecated — используй .glass-surface.glass-regular */`.

#### Scenario: Старые классы продолжают работать
- **WHEN** элемент использует `.glass-panel`
- **THEN** визуально он идентичен `.glass-surface.glass-regular`
