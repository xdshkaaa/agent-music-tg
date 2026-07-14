## 1. Типизация Telegram.WebApp.BackButton

- [x] 1.1 Добавить `BackButton` в интерфейс `TelegramWebApp` в `telegram.ts` (поля: `isVisible`, методы: `show`, `hide`, `onClick`, `offClick`)
- [x] 1.2 Проверить, что `getTelegramWebApp()` корректно возвращает BackButton (TypeScript не ругается)

## 2. History stack для Screen'ов

- [x] 2.1 В `App.tsx` добавить состояние `history: Screen[]` с начальным `[{ kind: "prompt" }]`
- [x] 2.2 Переписать `navigate()`: при forward-навигации push, при back — pop
- [x] 2.3 Обновить `activeTab()` и BottomNav: при смене таба сбрасывать history до корневого экрана таба
- [x] 2.4 Ограничить глубину стека (max 10 записей, срез с хвоста)
- [x] 2.5 Убедиться, что `ScreenTransition` корректно использует `transitionDir` из history-операции

## 3. Интеграция Telegram.BackButton

- [x] 3.1 В `App.tsx` добавить `useEffect`, который показывает BackButton когда:
  - `showPlayer === true`, или
  - `history.length > 1`
- [x] 3.2 В том же эффекте: скрывать BackButton когда оба условия false
- [x] 3.3 Зарегистрировать `BackButton.onClick()` один раз (или через `onEvent("backButtonClicked")`)
- [x] 3.4 В обработчике: если `showPlayer` — закрыть плеер; иначе если `history.length > 1` — pop history
- [x] 3.5 Очистить обработчик при размонтировании (`offClick` + `hide`)

## 4. enableClosingConfirmation

- [x] 4.1 В начальном `useEffect` в `App.tsx`: проверить, есть ли `enableClosingConfirmation` в TelegramWebApp
- [x] 4.2 Включить `enableClosingConfirmation()` когда `player.track !== null`
- [x] 4.3 Выключить когда трек закончился или плеер очищен

## 5. PlayerScreen — проверка совместимости

- [x] 5.1 Убедиться, что ArrowLeft в PlayerScreen продолжает работать (вызывает `onClose()`)
- [x] 5.2 Проверить, что свайп-вниз не конфликтует с Telegram BackButton (оба просто `setShowPlayer(false)`)
- [x] 5.3 Убедиться, что при закрытии плеера любым способом BackButton скрывается (если history.length === 1)

## 6. Проверка

- [x] 6.1 `bun run typecheck` — нет ошибок TypeScript
- [x] 6.2 `bun run build:miniapp` — сборка проходит
- [ ] 6.3 Тест: открыть плеер → BackButton виден → нажать BackButton → плеер закрывается
- [ ] 6.4 Тест: перейти prompt → clarify → results → нажать BackButton → вернуться на clarify → нажать BackButton → вернуться на prompt → BackButton скрыт
- [ ] 6.5 Тест: плеер открыт → BackButton → плеер закрылся → BackButton переключился на навигацию по экранам
- [ ] 6.6 Тест: переключить таб → history сбросился → BackButton скрыт
