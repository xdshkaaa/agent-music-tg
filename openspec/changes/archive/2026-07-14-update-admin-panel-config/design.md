## Context

Сейчас админ-функции разбросаны: allowlist и admin-роли — только env (bootstrapAllowlist на каждый старт), provider/backend — DB (settings table), остальное (offers, broadcast, shop settings) — тоже DB. Нет UI для управления пользователями и их балансами. Provider-специфичные параметры (model, base URL для opencode/ollama) не имеют runtime-редактирования.

Конфигурация лежит в `server/lib/settings.ts` — тонкая обёртка над `settings` (key-value). `server/lib/access-control.ts` — только чтение + bootstrap из env. `server/env.ts` — все provider-ключи, модели, URL.

## Goals / Non-Goals

**Goals:**
- Runtime CRUD для allowlist (добавить/удалить пользователя) и admin-ролей (назначить/снять), не зависящий от env
- Просмотр всех пользователей с балансом/подпиской, ручное начисление credits, продление subscription
- Редактирование provider-параметров (model, base_url) через админку, с fallback на env
- Переключение payments_enabled без перезапуска
- Единая страница всех settings key-value пар с редактором
- Bot FSM parity для новых функций
- Все новые API endpoints под `requireAdmin`

**Non-Goals:**
- История изменений (audit log) — не в этом change
- Pagination для users (пока список целиком, users < 1000)
- Multi-tenant — не требуется
- Визуальный редизайн админки

## Decisions

### 1. Provider config: `settings` table с неймспейсом `provider:<id>:<key>`

**Решение:** Хранить provider-специфичные опции в той же `settings` table под ключами `provider:anthropic:model`, `provider:opencode:base_url`, `provider:ollama:model` и т.д. При создании провайдера в `registry.ts` — читать эти оверрайды и merge с env-дефолтами.

**Альтернатива:** Отдельная таблица `provider_config`. Отвергнута — избыточно для 5 провайдеров с 1–2 параметрами каждый. Key-value `settings` table проще, не требует миграции.

**Итог:** `getProviderConfig(db, providerId)` → `{ model?, baseUrl? }`, мержится с env.

### 2. Allowlist bootstrap: seed-only, не перезаписывает runtime-изменения

**Решение:** `bootstrapAllowlist` в `access-control.ts` добавляет записи только если их нет (`INSERT OR IGNORE`), а не перезаписывает is_admin. Это позволит runtime-изменениям пережить рестарт. Новые admin-роли из env всё равно применятся.

**Альтернатива:** Убрать bootstrap целиком. Отвергнута — env должен иметь возможность задать начальный набор.

### 3. Payments toggle: runtime-ключ с fallback на env

**Решение:** `getPaymentsEnabled(db)` → сначала ищет `payments_enabled` в settings, если нет — fallback на `env.paymentsEnabled`. `setPaymentsEnabled(db, bool)` — пишет в settings.

### 4. API endpoints — однотипные JSON под `requireAdmin`

- `GET /api/admin/users` — список всех users
- `POST /api/admin/users/:chatId/credits` — начислить/списать credits
- `POST /api/admin/users/:chatId/subscription` — продлить subscription
- `POST /api/admin/access/add` — добавить в allowlist (chatId, isAdmin)
- `POST /api/admin/access/remove` — удалить из allowlist
- `POST /api/admin/access/set-role` — назначить/снять admin
- `GET /api/admin/provider-config` — список провайдеров с их активной конфигурацией
- `POST /api/admin/provider-config/:id` — обновить конфиг провайдера
- `GET /api/admin/all-settings` — все key-value пары
- `POST /api/admin/all-settings/:key` — обновить/удалить значение
- `GET /api/admin/payments-config` — payments_enabled статус
- `POST /api/admin/payments-config` — вкл/выкл

### 5. Mini App UI: AdminScreen с вкладками

AdminScreen реструктурируется: вместо вертикального стека — вкладки (Segmented) с переключением между секциями. Это позволит уместить 8+ панелей без скролла до бесконечности.

## Risks / Trade-offs

- **Provider config merge logic** → Если env изменился при деплое, а в БД старая оверрайда — может быть неочевидно. **Mitigation:** UI показывает какой параметр откуда (env/DB override).
- **INSERT OR IGNORE в bootstrap** → Если env удалил кого-то из admin, при рестарте права не снимутся. **Mitigation:** env — начальный seed, а runtime-редактор — основной инструмент. При необходимости можно очистить allowlist вручную через админку.
- **Payments toggle только на уровне middleware** → Уже созданные pending invoice не отменяются. **Mitigation:** check `paymentsEnabled` в момент создания invoice, а не только в middleware.
