## Why

Админка сейчас позволяет менять провайдера, бэкенд, пакеты и настройки магазина, но не даёт управлять доступом пользователей, их правами и балансами. Часть конфигурации (allowlist, admin-роли, настройки провайдеров) живёт только в env-переменных — для изменения нужен перезапуск сервера. Всю конфигурацию бота должно быть можно сделать через Mini App без доступа к серверу.

## What Changes

- **Allowlist & admin management через админку** — добавление/удаление пользователей из allowlist, назначение/снятие admin-роли без env
- **User management** — список пользователей с балансом, подпиской, датами; возможность manually выдавать/списывать credits, продлевать подписку
- **Provider config editor** — inline-редактирование параметров каждого AI-провайдера (model, base url) через админку; сохранение в БД с возможностью переопределить env
- **Payments toggle** — кнопка включения/отключения платежей (без перезапуска)
- **Все настройки в одном месте** — объединённая страница конфигурации (settings table), где видны все key-value пары с возможностью редактирования
- **Bot admin panel parity** — всё, что есть в Mini App, также доступно через бот

## Capabilities

### New Capabilities
- `access-management`: управление allowlist и admin-ролями пользователей через UI
- `user-management`: просмотр и ручное редактирование балансов/подписок пользователей
- `provider-config`: конфигурация параметров AI-провайдеров (model, base URL) через БД
- `unified-settings`: единая страница всех key-value настроек с редактором
- `payments-toggle`: вкл/выкл приёма платежей без перезапуска

### Modified Capabilities

None — openspec/specs/ пуст, существующие capability не специфицированы.

## Impact

- `server/lib/settings.ts` — расширить: поддержка provider-специфичных ключей, payments_enabled
- `server/lib/access-control.ts` — добавить функции для runtime-управления allowlist/admin
- `server/api/routes.ts` — новые endpoints: user list, grant/revoke credits, allowlist CRUD, provider config, settings editor
- `server/api/middleware.ts` — возможно, изменить проверку paymentsEnabled на runtime
- `server/bot/admin-panel.ts` — добавить новые callback handlers и FSM-шаги
- `miniapp/src/screens/AdminScreen.tsx` — секции: Users, Access Control, Provider Config, Settings, Payments
- `miniapp/src/lib/api.ts` — новые API-методы
