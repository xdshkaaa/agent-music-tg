## Why

UI-аудит выявил дублирование компонентов (volume-контроль, пустые состояния, панели пользователей) и проблемы удобства (нативные prompt/alert в Mini App, фулскрин-ошибки без retry, нет авто-скрытия ошибок). Всё это ухудшает восприятие премиального glass-интерфейса и создаёт лишнюю поддержку кода.

## What Changes

- Выделить `VolumeControl` в переиспользуемый компонент (PlayerBar + PlayerScreen)
- Выделить `EmptyState` в переиспользуемый компонент (ProfileScreen, BuyScreen)
- Выделить `ErrorBanner` с кнопкой закрытия и авто-скрытием по таймеру
- Убрать дублирование paid invoices между BuyScreen и ProfileScreen
- Заменить `prompt()`/`alert()`/`confirm()` в AdminScreen на inline-формы
- Добавить retry-кнопки к фулскрин-ошибкам (BuyScreen, ResultsScreen)
- Добавить минимальное время показа / debounce для TrackSkeleton
- Добавить визуальную обратную связь в ClarifyScreen при busy
- Сгруппировать табы админки в категории
- Убрать `localStorage`-костыль `am_last_paid_count` в BuyScreen
- Объединить дублирующиеся CSS-стили (.player-progress / .player-screen-progress)

## Capabilities

### New Capabilities
- `shared-ui-components`: переиспользуемые VolumeControl, EmptyState, ErrorBanner
- `admin-inline-forms`: замена нативных prompt/alert/confirm на inline-диалоги

### Modified Capabilities

<!-- No spec-level requirement changes — all changes are UI implementation -->

## Impact

- `miniapp/src/components/` — новые компоненты VolumeControl, EmptyState, ErrorBanner
- `miniapp/src/screens/PlayerScreen.tsx` — замена дублированного volume на VolumeControl
- `miniapp/src/components/PlayerBar.tsx` — замена дублированного volume на VolumeControl
- `miniapp/src/screens/BuyScreen.tsx` — inline error с retry, убрать localStorage-костыль
- `miniapp/src/screens/ResultsScreen.tsx` — retry при ошибке download
- `miniapp/src/screens/ProfileScreen.tsx` — EmptyState, убрать confirm
- `miniapp/src/screens/AdminScreen.tsx` — inline-формы вместо prompt/alert
- `miniapp/src/screens/ClarifyScreen.tsx` — spinner на busy
- `miniapp/src/screens/PromptScreen.tsx` — debounce скелетона
- `miniapp/src/styles/glass.css` — объединение дублирующихся правил
