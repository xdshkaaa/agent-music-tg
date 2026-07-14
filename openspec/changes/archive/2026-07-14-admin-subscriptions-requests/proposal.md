# Proposal: admin-subscriptions-requests

## Why

Сейчас выдача подписок и кредитов (запросов на генерацию) пользователям размазана по двум интерфейсам — бот-панели и мини-аппу — без единой формы, истории операций и мгновенного поиска юзеров. Админ тратит лишнее время на поиск chat_id, ручной ввод данных и проверку результата. Нужна выделенная панель управления подписками и кредитами: быстрая выдача, прозрачная история и чёткий статус каждого пользователя.

## What Changes

- **Единая панель "Выдача" в AdminScreen мини-аппа** — отдельный таб вместо вкладки "Пользователи": поиск юзера по username/chat_id, форма выдачи кредитов (количество), форма выдачи подписки (количество дней), кнопка отзыва подписки.
- **История операций** — таблица `grant_history` с полями: `id`, `chat_id`, `type` ('credits' | 'subscription'), `amount`, `granted_by` (chat_id админа), `created_at`. Админ видит историю выдач конкретному пользователю и общую ленту.
- **Серверные эндпоинты**:
  - `POST /api/admin/users/:chatId/credits` — расширяется: пишет в grant_history.
  - `POST /api/admin/users/:chatId/subscription` — расширяется: пишет в grant_history.
  - `GET /api/admin/grant-history?chat_id=X` — история выдач юзера.
  - `GET /api/admin/grant-history` — вся лента с пагинацией.
  - `DELETE /api/admin/users/:chatId/subscription` — отзыв подписки (обнуление subscription_until).
- **Бот-панель** — добавляется кнопка "Выдача" в `/admin` с клавиатурой: поиск юзера, выдача кредитов/подписки, история.

## Capabilities

### New Capabilities

- `admin-grant-credits`: Выдача кредитов (запросов на генерацию) конкретному пользователю через админ-панель с записью в историю.
- `admin-grant-subscription`: Выдача и отзыв подписки (дней генерации) конкретному пользователю через админ-панель с записью в историю.
- `admin-grant-history`: Просмотр истории выдач кредитов и подписок — по пользователю и общей ленты.

### Modified Capabilities

*(нет изменений в существующих spec — только новые)*

## Impact

- **DB**: Новая таблица `grant_history` (идемпотентная миграция в `server/db.ts`).
- **Server**: Новые эндпоинты в `server/api/routes.ts`; расширение `POST /admin/users/:chatId/credits` и `POST /admin/users/:chatId/subscription` в `server/api/routes.ts`; новый модуль истории `server/admin/grant-history.ts`.
- **Miniapp**: Новый таб "Выдача" в `miniapp/src/screens/AdminScreen.tsx` с формами поиска, выдачи кредитов, выдачи/отзыва подписки, историей. Новые методы в `miniapp/src/lib/api.ts`.
- **Bot**: Расширение `server/bot/admin-panel.ts` — кнопка "Выдача" с подменю.
- Без новых зависимостей.
