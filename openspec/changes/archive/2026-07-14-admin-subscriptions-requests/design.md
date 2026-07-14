# Design: admin-subscriptions-requests

## Context

Текущая панель "Пользователи" (`UsersPanel` в `AdminScreen.tsx`) — это сырой список всех юзеров с двумя кнопками `prompt()`. Нет поиска, нет формы для точного ввода (только нативный `prompt`), нет подтверждения операции, нет отзыва подписки, нет истории выдач. В бот-панели (`admin-panel.ts`) выдача credits и подписки тоже через FSM-диалог без истории.

Стек: Bun + Hono, SQLite (`bun:sqlite`), React + Vite (мини-апп), grammY (бот).
Таблицы `users` (credits, subscription_until), `settings`, `grant_history` (новая).
Эндпоинты выдачи уже есть: `POST /admin/users/:chatId/credits` и `POST /admin/users/:chatId/subscription`.

## Goals / Non-Goals

**Goals:**
- Выделенный таб "Выдача" в AdminScreen мини-аппа с поиском пользователя по username/chatId.
- Форма выдачи кредитов (количество, положительное или отрицательное).
- Форма выдачи подписки (количество дней) и кнопка отзыва подписки.
- История операций выдачи — новая таблица `grant_history`, эндпоинты, UI ленты по пользователю и общей.
- Кнопка "Выдача" в бот-панели `/admin` с подменю: поиск юзера, выдача, история.

**Non-Goals:**
- Редизайн существующей вкладки "Пользователи" (она остаётся как есть).
- Изменение модели платежей или офферов.
- Email/SMS уведомления о выдаче.
- Пакетная выдача (CSV-импорт и т.п.).

## Decisions

1. **Новый таб "Выдача" (`issuance`) в AdminScreen**, не расширение UsersPanel. Разделение ответственности: UsersPanel — просмотр, IssuancePanel — действия. У `settigns` не трогаем.
2. **Поиск пользователя — клиентский фильтр**. Загружаем весь список `/admin/users` и фильтруем на клиенте по username/chatId (список ~сотни юзеров, SQLite — не проблема). Альтернатива — серверный поиск — отвергнута: лишний эндпоинт без необходимости, данные уже есть.
3. **Форма выдачи — инлайн, не `prompt()`**. Все поля ввода в DOM: числовой input для credits (с поддержкой отрицательных для списания), числовой input для дней подписки, кнопки "Выдать" / "Отозвать подписку".
4. **Отзыв подписки = `DELETE /admin/users/:chatId/subscription`**. Сервер обнуляет `subscription_until` в NULL. Новая функция `revokeSubscription` в `users-store.ts`. Мягкое удаление: запись в `grant_history` с `amount = 0` и `type = 'subscription_revoked'`.
5. **Таблица `grant_history`**: идемпотентная миграция в `server/db.ts`:
   ```sql
   CREATE TABLE IF NOT EXISTS grant_history (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     chat_id INTEGER NOT NULL,
     type TEXT NOT NULL CHECK(type IN ('credits','subscription','subscription_revoked')),
     amount INTEGER NOT NULL,
     granted_by INTEGER NOT NULL,
     created_at INTEGER NOT NULL DEFAULT (unixepoch())
   );
   CREATE INDEX IF NOT EXISTS idx_grant_history_chat_id ON grant_history(chat_id);
   ```
6. **Запись в grant_history** — внутри `users-store.ts`: функции `addCredits`, `extendSubscription`, `revokeSubscription` принимают опциональный параметр `grantedBy: number`. Существующие вызовы без `grantedBy` (покупки, триал) передают `grantedBy = 0` (системная выдача). Это сохраняет обратную совместимость.
7. **Новый модуль `server/admin/grant-history.ts`** с функциями:
   - `getGrantHistoryForUser(db, chatId)` — история конкретного юзера.
   - `getAllGrantHistory(db, limit, offset)` — общая лента с пагинацией.
8. **Эндпоинты** (все `requireAdmin`):
   - `GET /admin/grant-history?chatId=X` — история юзера.
   - `GET /admin/grant-history` — общая лента (пагинация `?limit=50&offset=0`).
   - `DELETE /admin/users/:chatId/subscription` — отзыв подписки.
   Существующие `POST /admin/users/:chatId/credits` и `POST /admin/users/:chatId/subscription` расширяются: принимают `grantedBy` из сессии админа и пишут в grant_history.
9. **grantedBy из сессии** — админский `chatId` передаётся из `c.get('chatId')` в middleware (уже установлено в `requireAuth`). Для бот-панели `grantedBy` — `ctx.from.id`.
10. **Бот-панель**: новая кнопка "Выдача" в главном меню `/admin` → подменю: "Поиск юзера", "Последние выдачи". Остаётся FSM-диалог, но с записью в grant_history. Мини-апп — основной интерфейс, бот — вспомогательный.

## Risks / Trade-offs

- [grantedBy=0 для системных выдач] → История не привязывается к админу для покупок/триала. Приемлемо: покупки уже есть в `invoices`, триал — в `trial_claimed_at`.
- [Клиентский поиск при 10k+ пользователях] → Загрузка всего списка станет медленной. На данном этапе неактуально; если понадобится — добавить серверный поиск с `LIKE`.
- [Отзыв подписки без возврата средств] → Чисто админская операция, возврат средств — отдельный процесс.
- [Отрицательные credits] → Уже поддерживается (`addCredits` с отрицательным `amount`), в UI форма принимает знак.

## Migration Plan

Стандартный деплой (`deploy/deploy.sh`): миграция таблицы `grant_history` идемпотентна (`CREATE TABLE IF NOT EXISTS`), выполняется при старте сервера. Старые версии эндпоинтов (без `grantedBy`) продолжают работать — параметр опциональный. Откат: предыдущий релиз игнорирует таблицу `grant_history`, данные не теряются.

## Open Questions

Нет.
