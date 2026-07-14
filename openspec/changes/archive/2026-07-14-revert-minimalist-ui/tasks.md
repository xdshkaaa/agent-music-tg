## 1. Visual Foundation — Liquid-glass токены

- [x] 1.1 Тёмная палитра: `--glass-bg-dark`, `--glass-border-dark`, `--glass-highlight`, фиолетовый `--accent: #a855f7`
- [x] 1.2 Светлая палитра: `:root[data-scheme="light"]` оверрайды для всех токенов
- [x] 1.3 Тени: `--glass-shadow`, `--glass-shadow-active`, `--glass-shadow-indicator` с multi-layer inset + drop shadow
- [x] 1.4 Inter Tight как `--font-display`
- [x] 1.5 `backdrop-filter: blur()` на body и app-shell

## 2. Glass utility-классы

- [x] 2.1 `.glass` — resting shadow
- [x] 2.2 `.glass-active` — pressed/selected shadow
- [x] 2.3 `.glass-indicator` — segmented control indicator shadow

## 3. Поверхности

- [x] 3.1 `.glass-panel` — backdrop-filter, glass shadow, ::before highlight
- [x] 3.2 `.glass-button` — backdrop-filter, glass shadow, :active shadow swap
- [x] 3.3 `.glass-button.primary` — purple gradient
- [x] 3.4 `.glass-input` — backdrop-filter, glass border
- [x] 3.5 `.segmented` — backdrop-filter, glass-indicator
- [x] 3.6 `.dock-inner` — backdrop-filter, glass shadow
- [x] 3.7 `.player-bar` — backdrop-filter, glass shadow
- [x] 3.8 `.player-screen` — backdrop-filter, glass shadow
- [x] 3.9 `.action-btn` — backdrop-filter, glass shadow
- [x] 3.10 `.wallet-pill` — backdrop-filter, glass border
- [x] 3.11 `.status-card` — backdrop-filter, glass shadow

## 4. Шрифт

- [x] 4.1 Inter Tight link в `index.html`
- [x] 4.2 `--font-display: 'Inter Tight', ...`

## 5. Verification

- [x] 5.1 `bun run build:miniapp` — без ошибок
