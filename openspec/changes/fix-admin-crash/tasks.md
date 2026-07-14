## 1. ErrorBoundary компонент

- [x] 1.1 Создать `miniapp/src/components/ErrorBoundary.tsx` — классовый компонент с `componentDidCatch` и `getDerivedStateFromError`
- [x] 1.2 Реализовать `DefaultErrorFallback` — иконка WarningCircle + текст «Что-то пошло не так» + кнопка «На главную»
- [x] 1.3 Логировать ошибку и componentStack в `console.error`

## 2. Интеграция ErrorBoundary в App.tsx

- [x] 2.1 Обернуть `<AppInner>` (или всё дерево после PlayerProvider) в глобальный ErrorBoundary
- [x] 2.2 В fallback ErrorBoundary принимать callback для сброса: через контекст или props — сброс history на `[{ kind: "prompt" }]`
- [ ] 2.3 `bun run typecheck` — убедиться, что тип ErrorBoundary совместим с React 18

## 3. retryableLazy — устойчивый lazy import

- [ ] 3.1 Создать утилиту `retryableLazy` в отдельном файле (или в ErrorBoundary.tsx): автоматический retry 1 раз при ошибке импорта
- [ ] 3.2 Заменить `lazy(() => import("./screens/AdminScreen"))` на `retryableLazy`
- [ ] 3.3 Обернуть `<AdminScreen>` в локальный ErrorBoundary с fallback «Ошибка загрузки админки» + кнопка «Повторить»

## 4. Сборка и проверка

- [ ] 4.1 `bun run typecheck` — нет ошибок TypeScript
- [ ] 4.2 `bun run build:miniapp` — сборка проходит
- [ ] 4.3 Тест: открыть приложение → нажать «Админ» → админка загружается и работает
- [ ] 4.4 Тест: симулировать ошибку в AdminScreen (выключить сеть) → показан fallback с кнопкой «Повторить» → нажать повторить → админка загружается
