# Proposal: admin-icons-and-shop-ui-polish

## Why

Магазин и профиль выглядят сыро: вместо иконок пакетов — одинаковые placeholder-точки, кнопки цен читаются как «111 1», списки загрузок плоские и громоздкие. Админ не может брендировать приложение: иконка и название в хедере («agent music») захардкожены, у товаров магазина нет иконок вообще.

## What Changes

- Добавляется поле `icon` (emoji или URL картинки) у пакетов магазина (offers); админ задаёт его в форме создания/редактирования оффера, покупатель видит иконку в карточке пакета.
- Добавляются настройки `headerIcon` и `headerTitle` в shop settings; админ редактирует их в панели «Магазин»; хедер мини-аппа рендерит их вместо захардкоженных точки и «agent music».
- Появляется публичный эндпоинт `GET /api/shop-config`, отдающий брендинг (headerIcon, headerTitle) без админ-прав.
- UI-полировка BuyScreen: карточки пакетов с иконками, аккуратный формат цен (`1 TON`, `100 ⭐`), единый стиль кнопок, пустое состояние поиска.
- UI-полировка ProfileScreen: компактные play-кнопки в списке загрузок, выравнивание строк треков, визуальная иерархия блока баланса.

## Capabilities

### New Capabilities

- `offer-icons`: per-package иконка (emoji или URL) — хранение, админ CRUD, отображение в магазине.
- `shop-branding`: админ-настраиваемые иконка и название хедера, публичная выдача через shop-config, рендер в хедере мини-аппа.
- `shop-ui-polish`: визуальные требования к карточкам пакетов BuyScreen и спискам ProfileScreen (формат цен, компактные контролы, состояния).

### Modified Capabilities

<!-- нет main-specs в openspec/specs/ — требования существующих capability не меняются -->

## Impact

- **DB**: `server/db.ts` — миграция `ALTER TABLE offers ADD COLUMN icon TEXT` (идемпотентный паттерн).
- **Server**: `server/payments/offers-store.ts` (модель Offer), `server/api/routes.ts` (POST/PATCH `/admin/offers`, новый `GET /api/shop-config`), `server/lib/settings.ts` (ShopSettings).
- **Miniapp**: `miniapp/src/lib/api.ts`, `miniapp/src/screens/BuyScreen.tsx`, `miniapp/src/screens/ProfileScreen.tsx`, `miniapp/src/screens/AdminScreen.tsx`, `miniapp/src/App.tsx`; новый общий компонент рендера emoji/URL-иконки.
- Без новых зависимостей; обратная совместимость: пустой `icon`/настройки → текущие дефолты.
