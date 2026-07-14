## Context

Текущая архитектура Mini App — React 18 с `React.lazy` для AdminScreen, без ErrorBoundary. Приложение имеет единственное дерево компонентов:

```
<PlayerProvider>
  <AppInner>
    <ScreenTransition>
      {renderScreen()}   {/* <- сюда рендерится AdminScreen */}
    </ScreenTransition>
    <BottomNav />
    <PlayerBar />
  </AppInner>
</PlayerProvider>
```

Любая ошибка в любом дочернем компоненте (render, hook, async import) роняет всё приложение — React без ErrorBoundary размонтирует корневое дерево. На белый экран нет даже сообщения.

AdminScreen загружается лениво (`lazy(() => import(...))`), и ошибка при загрузке чанка (сеть, 404, parse error) тоже не обрабатывается — Suspense ловит только pending state, не rejected.

## Goals / Non-Goals

**Goals:**
- ErrorBoundary вокруг app-shell — ловит ошибки рендера, показывает сообщение и кнопку «На главную»
- Fallback при ошибке lazy-загрузки AdminScreen — вместо падения показывать сообщение с кнопкой повтора
- Логирование ошибок в console.error для диагностики
- AdminScreen остаётся lazy-loaded (не теряем code-split)

**Non-Goals:**
- Не переписываем навигацию/роутер
- Не меняем BottomNav / ScreenTransition
- Не добавляем sentry или внешние сервисы мониторинга
- Не чиним конкретные баги в админке (только защита от падений)

## Decisions

### Decision 1: Классовый ErrorBoundary (единственный React-способ)

React ErrorBoundary работает только через `componentDidCatch` — классовые компоненты. Используем отдельный файл `ErrorBoundary.tsx`.

```tsx
class ErrorBoundary extends React.Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <DefaultErrorFallback error={this.state.error!} />;
    }
    return this.props.children;
  }
}
```

**Почему не хук:** React не предоставляет функционального аналога ErrorBoundary. Можно использовать `react-error-boundary` пакет, но классовый компонент без зависимостей предпочтительнее.

### Decision 2: Два уровня ErrorBoundary

1. **Глобальный** (вокруг `<PlayerProvider>` или `<AppInner>`) — ловит любую ошибку в любом экране. Показывает заглушку с кнопкой «На главную» (сбрасывает history).
2. **Локальный** для AdminScreen — ловит ошибку lazy-загрузки или рендера внутри AdminScreen. Показывает «Ошибка загрузки админки» с кнопкой повтора.

### Decision 3: Fallback для AdminScreen при ошибке lazy-import

React.lazy + Suspense не обрабатывает rejected promise. Нужна обёртка `retryableLazy`:

```tsx
function retryableLazy<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    // retry один раз
    try {
      return await importFn();
    } catch (e) {
      console.error("[retryableLazy] first attempt failed", e);
      return await importFn();
    }
  });
}
```

Если повторная загрузка тоже не удалась — ErrorBoundary ловит и показывает UI с кнопкой «Ещё раз».

### Decision 4: Кнопка «На главную» в глобальном fallback

При ошибке в глобальном ErrorBoundary показываем:
- Иконку WarningCircle
- Текст «Что-то пошло не так»
- Кнопку «На главную» — сбрасывает `history` на `[{ kind: "prompt" }]` и очищает error state

Так как ErrorBoundary вне React-дерева с состоянием AppInner, сброс делаем через вызов функции, переданной через контекст или global-событие.

## Risks / Trade-offs

- **[Risk]** ErrorBoundary может ловить ошибки, которые не должны быть «проглочены» (например, TypeError, отладка). **Mitigation:** всегда логируем в console.error с componentStack.
- **[Trade-off]** retryableLazy делает ещё один сетевой запрос при ошибке. Это нормально — чанк мог временно 404 из-за развёртывания.
- **[Risk]** Двойной ErrorBoundary (глобальный + локальный) может запутать — какая где ошибка. **Mitigation:** разный текст fallback: «Что-то пошло не так» (глобальный) vs «Ошибка загрузки админки» (локальный).
- **[Risk]** Без ErrorBoundary ошибка в BottomNav, PlayerBar или PlayerScreen тоже роняет приложение. **Mitigation:** глобальный ErrorBoundary покрывает всё дерево.
