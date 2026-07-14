# Tasks: admin-subscriptions-requests

## 1. DB: grant_history table

- [x] 1.1 Добавить идемпотентную миграцию `CREATE TABLE IF NOT EXISTS grant_history` и индекс `idx_grant_history_chat_id` в `server/db.ts`

## 2. Server: grant history store

- [x] 2.1 Создать `server/admin/grant-history.ts` с функциями `getGrantHistoryForUser(db, chatId)`, `getAllGrantHistory(db, limit, offset)` и типами `GrantHistoryRecord`, `GrantHistoryType`
- [x] 2.2 Экспортировать из `server/admin/index.ts` или подключить напрямую

## 3. Server: extend users-store with grantedBy + revoke

- [x] 3.1 Изменить `addCredits` — добавить опциональный параметр `grantedBy?: number`, записывать в `grant_history` при вызове
- [x] 3.2 Изменить `extendSubscription` — добавить опциональный параметр `grantedBy?: number`, записывать в `grant_history`
- [x] 3.3 Добавить функцию `revokeSubscription(db, chatId, grantedBy?: number)` — обнуляет `subscription_until` и пишет в `grant_history` с `type='subscription_revoked'`

## 4. Server: new API endpoints

- [x] 4.1 Добавить `DELETE /admin/users/:chatId/subscription` в `server/api/routes.ts` — вызов `revokeSubscription` с `grantedBy` из сессии
- [x] 4.2 Добавить `GET /admin/grant-history?chatId=X` в `server/api/routes.ts` — история юзера
- [x] 4.3 Добавить `GET /admin/grant-history` (без query) — общая лента с пагинацией `?limit=50&offset=0`
- [x] 4.4 Расширить существующий `POST /admin/users/:chatId/credits` — передавать `grantedBy` из сессии
- [x] 4.5 Расширить существующий `POST /admin/users/:chatId/subscription` — передавать `grantedBy` из сессии

## 5. Miniapp: API client

- [x] 5.1 Добавить типы `GrantHistoryRecord`, `GrantHistoryResponse` в `miniapp/src/lib/api.ts`
- [x] 5.2 Добавить методы `adminGrantCreditsWithHistory`, `adminExtendSubscriptionWithHistory`, `adminRevokeSubscription`, `adminGrantHistory(chatId?)` в `miniapp/src/lib/api.ts`

## 6. Miniapp: issuance panel UI

- [x] 6.1 Добавить таб `"issuance"` в `AdminTab` и `SETTINGS_TABS` / `SETTINGS_LABELS` в `AdminScreen.tsx`
- [x] 6.2 Создать компонент `IssuancePanel`: поиск пользователя (клиентский фильтр по username/chatId), отображение текущего баланса/подписки
- [x] 6.3 Форма выдачи credits: числовой input (отрицательные для списания), кнопка "Выдать", подтверждение
- [x] 6.4 Форма выдачи подписки: числовой input (дни), кнопка "Выдать"
- [x] 6.5 Кнопка "Отозвать подписку" с подтверждением
- [x] 6.6 Блок "История выдач": таблица операций для выбранного пользователя (тип, количество, дата, кто выдал)
- [x] 6.7 Добавить рендер `{tab === "issuance" && <IssuancePanel />}` в основной `AdminScreen`
- [x] 6.8 Проверить, что UsersPanel не сломан

## 7. Bot: admin panel update

- [x] 7.1 Добавить кнопку "Выдача" в главное меню `/admin` (`admin-panel.ts`)
- [x] 7.2 Добавить подменю выдачи: поиск юзера, выдача credits, выдача подписки
- [x] 7.3 Расширить FSM-диалоги выдачи — передавать `ctx.from.id` как `grantedBy`

## 8. Verification

- [x] 8.1 `bun test` в `server/` — 95 pass, 0 fail
- [x] 8.2 `bun run build` в `miniapp/` — сборка без ошибок
- [x] 8.3 Ручная проверка: выдача credits юзеру, проверка баланса и grant_history; выдача подписки, проверка subscription_until; отзыв подписки; просмотр истории в UI
