## Why

При переходе на вкладку «Админ» в Mini App приложение падает — экран становится белым/пустым без сообщения об ошибке. Пользователи-администраторы не могут управлять настройками бота. Root cause: нет ErrorBoundary, любая ошибка в AdminScreen (lazy import, API, рендер) роняет всё дерево React.

## What Changes

1. **Добавить ErrorBoundary** — обернуть всё приложение (или критичные экраны) в ErrorBoundary, который ловит ошибки рендера и показывает сообщение вместо белого экрана.
2. **Обработка ошибок AdminScreen** — добавить try/catch вокруг вызова `lazy(() => import(...))` и API-запросов, чтобы ошибка в админке не ломала остальное приложение.
3. **Retry-механизм** — при ошибке загрузки AdminScreen показать кнопку «Повторить» вместо падения.
4. **Логирование** — ошибки в консоль для диагностики.

## Capabilities

### New Capabilities
- `error-boundary`: React ErrorBoundary — ловит ошибки рендера, показывает UI ошибки, не роняет всё приложение.
- `admin-fallback`: Fallback для AdminScreen при ошибке загрузки — вместо краша показывает сообщение и кнопку повтора.

### Modified Capabilities
- _(none)_

## Impact

- `miniapp/src/App.tsx` — обёртка app-shell в ErrorBoundary; fallback для AdminScreen при ошибке lazy import
- `miniapp/src/components/ErrorBoundary.tsx` — новый компонент-ловушка ошибок
- `miniapp/src/screens/AdminScreen.tsx` — обработка ошибок API (уже частично есть, проверка + логи)
