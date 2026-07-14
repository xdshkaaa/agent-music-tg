## Why

Пейволл (PAYMENTS_ENABLED=true) блокирует генерацию плейлистов для всех пользователей, включая admin'ов. Администраторам нужна бесплатная генерация без покупки credits/подписки — для тестирования и демонстрации бота.

## What Changes

- Администраторы (chat_id в allowlist с флагом is_admin=1) получают бесплатную генерацию в обход paywall
- `hasAccess()` в `server/access/entitlements.ts` расширяется: возвращает `true` для admin'ов независимо от credits/subscription
- Доступ не расходуется (consumeAccess для admin'ов — no-op)
- Обычные пользователи без credits/подписки продолжают видеть экран покупки

## Capabilities

### New Capabilities
- `admin-free-generation`: Администраторы могут генерировать плейлисты бесплатно, без credits и подписки

### Modified Capabilities
_(нет изменений в существующих spec-файлах)_

## Impact

- `server/access/entitlements.ts`: изменить `hasAccess()` и `consumeAccess()` — добавить проверку на admin
- `server/lib/access-control.ts`: используется `isAdmin()` или `getChatRole()` для проверки
- Тесты: `entitlements` тест нужно дополнить кейсами для admin
- DB: изменений не требуется — is_admin уже хранится в таблице allowlist
