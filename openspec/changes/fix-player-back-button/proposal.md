## Why

При открытии полноэкранного плеера (PlayerScreen) кнопка «Назад» в Telegram Mini App не работает — Telegram.WebApp.BackButton не реализован. На Android нажатие аппаратной кнопки «Назад» закрывает весь Mini App вместо того, чтобы закрыть плеер. На iOS/Desktop Telegram не показывает кнопку «Назад» в хедере.

## What Changes

- Добавить `BackButton` в интерфейс `TelegramWebApp` в `telegram.ts`
- В `App.tsx` добавить `useEffect`, который отслеживает состояние `showPlayer` и:
  - Показывает `Telegram.WebApp.BackButton` при открытии плеера
  - Скрывает при закрытии
  - Обрабатывает событие `backButtonClicked` → закрытие плеера
- Для остальных экранов (Screen kind) реализовать простой history stack, чтобы BackButton работал при навигации назад через экраны (prompt → clarify → results → ...)
- В `PlayerScreen.tsx` убедиться, что Telegram BackButton и свайп-вниз не конфликтуют

## Capabilities

### New Capabilities
- `tg-back-button`: интеграция Telegram.WebApp.BackButton — показ/скрытие и обработка клика
- `navigation-history`: стек навигации между Screen'ами для поддержки кнопки «Назад»

### Modified Capabilities

(пусто)

## Impact

- `miniapp/src/lib/telegram.ts` — расширение интерфейса TelegramWebApp
- `miniapp/src/App.tsx` — добавление useEffect для BackButton + history stack
- `miniapp/src/screens/PlayerScreen.tsx` — возможно, минимальные изменения для корректной работы с BackButton
