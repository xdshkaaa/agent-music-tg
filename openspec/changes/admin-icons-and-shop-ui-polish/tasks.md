# Tasks: admin-icons-and-shop-ui-polish

## 1. Server: offer icon

- [x] 1.1 Добавить идемпотентную миграцию `ALTER TABLE offers ADD COLUMN icon TEXT` в `server/db.ts` (рядом с `stars_amount`, ~:80-82)
- [x] 1.2 Добавить `icon?: string` в `Offer`/`OfferInput`/`OfferRow`/`toOffer` и колонку в INSERT/UPDATE в `server/payments/offers-store.ts`
- [x] 1.3 Принять и валидировать `icon` (trim, ≤200 символов, пустая строка → NULL) в POST/PATCH `/admin/offers` в `server/api/routes.ts` (:191-245, ручная валидация в стиле файла)

## 2. Server: shop branding

- [x] 2.1 Добавить `headerIcon`, `headerTitle` в `ShopSettings` (get/set) в `server/lib/settings.ts` (:44-73)
- [x] 2.2 Добавить публичный `GET /api/shop-config` в `server/api/routes.ts`, возвращающий только `{ headerIcon, headerTitle }` (auth мини-аппа, без админ-прав — как `/api/offers`)

## 3. Miniapp: API client + IconOrEmoji

- [x] 3.1 Добавить `icon` в типы `Offer`/`OfferInput` и метод `shopConfig()` в `miniapp/src/lib/api.ts` (:30-82, :210+)
- [x] 3.2 Создать `miniapp/src/components/IconOrEmoji.tsx`: props `icon?`, `size`, `fallback`; `http`-префикс → `<img loading="lazy">` c `onError`-fallback, иначе emoji-текст; фиксированный контейнер без layout shift

## 4. Miniapp: admin UI

- [x] 4.1 Добавить поле «Иконка (emoji или URL)» в `OfferForm` и `EMPTY_OFFER` в `miniapp/src/screens/AdminScreen.tsx` (:35, :65-114)
- [x] 4.2 Добавить поля headerIcon/headerTitle в `ShopSettingsPanel` (`AdminScreen.tsx:199-237`)

## 5. Miniapp: header branding

- [x] 5.1 Загружать shop-config в `App.tsx` и рендерить IconOrEmoji + headerTitle в `.logo-chip` (:99-108) с дефолтами (accent-точка, «agent music») без мигания
- [x] 5.2 Заменить хардкод «agent music» в `ProfileScreen.tsx:226` на headerTitle из shop-config

## 6. Miniapp: UI polish

- [x] 6.1 BuyScreen: карточки пакетов — IconOrEmoji вместо placeholder-точки (:175-190), helper `formatPrice(amount, asset)` (число без хвостовых нулей + пробел + asset), единый стиль/высота кнопок цен
- [x] 6.2 BuyScreen: пустое состояние поиска/фильтра (иконка + «ничего не найдено»)
- [x] 6.3 ProfileScreen: компактные play-кнопки (≤32px) и выровненные строки треков в списке загрузок (:31-109, :91-104), единые отступы
- [x] 6.4 ProfileScreen: иерархия блока баланса (:231-248) — крупный баланс, приглушённая подписка, кнопка «Пополнить» в высоту блока
- [x] 6.5 Проверить обе темы (dark + `:root[data-scheme="light"]`) — только CSS-переменные glass.css

## 7. Verification

- [x] 7.1 `bun test` в `server/` — существующие тесты проходят (90 pass, 0 fail)
- [x] 7.2 `bun run build` в `miniapp/` — сборка без ошибок
- [ ] 7.3 Ручная проверка: оффер с emoji и с URL-иконкой отображается в магазине; битый URL → fallback-точка; смена headerIcon/headerTitle обновляет хедер; пустые настройки → дефолтный вид
