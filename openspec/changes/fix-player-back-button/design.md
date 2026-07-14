## Context

В Mini App используется state-driven навигация без роутера — единственный `screen` state и флаг `showPlayer` для оверлея плеера. Telegram.WebApp.BackButton не задействован нигде.

Текущая схема:

```
App.tsx
├── screen state (prompt | clarify | results | buy | profile | admin)
│   └── ScreenTransition → renderScreen()
├── showPlayer boolean
│   └── PlayerScreen (overlay)
└── Telegram.WebApp: не используется
```

При открытии PlayerScreen:
- Android: аппаратная кнопка «Назад» → закрывает Mini App целиком
- iOS/Desktop: TG не показывает кнопку «Назад» в хедере
- In-app ArrowLeft работает, но это не системная кнопка

## Goals / Non-Goals

**Goals:**
- Интегрировать Telegram.WebApp.BackButton: показывать при открытом плеере, скрывать при закрытии
- Обрабатывать `backButtonClicked` → закрывать плеер (или возвращаться на предыдущий экран)
- Добавить простой history stack для навигации между Screen'ами (без роутера)
- BackButton работает и для плеера, и для экранов
- PlayerScreen ArrowLeft продолжает работать

**Non-Goals:**
- Переход на React Router / URL-based routing
- Глубокая навигация (deep links)
- История более 10 шагов (только разумный стек)
- Изменение логики BottomNav

## Decisions

### Decision 1: History stack поверх screen state, а не замена

Вместо внедрения роутера — минимальный массив `history: Screen[]` в App.tsx.

```typescript
const [history, setHistory] = useState<Screen[]>([{ kind: "prompt" }]);
const screen = history[history.length - 1];

function navigate(screen: Screen, dir?: "forward" | "back") {
  if (dir === "back" && history.length > 1) {
    setHistory(prev => prev.slice(0, -1));
  } else {
    setHistory(prev => [...prev, screen]);
  }
}
```

**Почему не полноценный роутер:** навигация простая (5 экранов + плеер), роутер добавит лишнюю сложность. Стек из массива — предсказуемо и тривиально.

### Decision 2: BackButton управляется одним useEffect

```typescript
useEffect(() => {
  const webApp = getTelegramWebApp();
  if (!webApp) return;

  if (showPlayer || history.length > 1) {
    webApp.BackButton.show();
    webApp.BackButton.onClick(handleBack);
  } else {
    webApp.BackButton.hide();
    webApp.BackButton.offClick(handleBack);
  }

  return () => {
    webApp.BackButton.offClick(handleBack);
    webApp.BackButton.hide();
  };
}, [showPlayer, history.length]);
```

Приоритет: если открыт плеер — BackButton закрывает плеер. Если плеера нет, но history.length > 1 — возвращает на предыдущий экран.

### Decision 3: Событие `backButtonClicked` через `onEvent`

Telegram SDK использует `onEvent("backButtonClicked", handler)` — обработчик вешается один раз при монтировании App. Внутри него — проверка состояния:

```typescript
useEffect(() => {
  const webApp = getTelegramWebApp();
  if (!webApp) return;

  if (showPlayer) {
    webApp.BackButton.show();
  } else if (history.length > 1) {
    webApp.BackButton.show();
  } else {
    webApp.BackButton.hide();
  }
}, [showPlayer, history]);

useEffect(() => {
  const webApp = getTelegramWebApp();
  if (!webApp) return;
  webApp.onEvent("backButtonClicked", () => {
    if (showPlayer) {
      setShowPlayer(false);
    } else if (history.length > 1) {
      setHistory(prev => prev.slice(0, -1));
    }
  });
}, []);
```

(На самом деле Telegram 8.0+ рекомендует `BackButton.onClick()`, но `onEvent("backButtonClicked")` тоже работает. Выбираем `BackButton.onClick` — он современнее и читаемее.)

### Decision 4: Никаких конфликтов со свайпом в PlayerScreen

Свайп вниз в PlayerScreen — это жест поверх React-элемента, он не триггерит Telegram BackButton. Они ортогональны:
- Свайп вниз → быстрое закрытие пальцем
- BackButton → системное/аппаратное нажатие

Оба просто вызывают `setShowPlayer(false)` — коллизий нет.

### Decision 5: `enableClosingConfirmation` на корневом экране

Когда history.length === 1 (корневой экран prompt) и плеер закрыт — BackButton скрыт. Можно включить `enableClosingConfirmation`, чтобы при случайном выходе из Mini App показывался диалог подтверждения.

## Risks / Trade-offs

- **[Risk]** `BackButton.onClick` может заменить предыдущий обработчик при повторном вызове → **Mitigation:** вызываем `offClick` перед `onClick`, храним ссылку на handler
- **[Risk]** Стек history может расти бесконечно → **Mitigation:** ограничение глубины (max 10), при резком росте истории сбрасываем до корневого экрана
- **[Risk]** `enableClosingConfirmation` может раздражать пользователей на Android → **Mitigation:** включить только если есть активный трек в плеере (player.track !== null), иначе не показывать
- **[Trade-off]** history stack не сохраняется при перезагрузке Mini App → это нормально, TG Mini App редко перезагружаются внутри сессии
