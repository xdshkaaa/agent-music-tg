# Design: admin-icons-and-shop-ui-polish

## Context

Mini App (React + Vite, `miniapp/`) + Bun-сервер (`server/`, SQLite через `server/db.ts`). Офферы магазина хранятся в таблице `offers` (`server/payments/offers-store.ts`), CRUD — ручные роуты в `server/api/routes.ts` без zod. Глобальные настройки — key-value таблица `settings` с типизированными группами в `server/lib/settings.ts` (`ShopSettings`: shopName/supportContact/aboutText). Хедер («agent music» + фиолетовая точка `.ring`) захардкожен в `miniapp/src/App.tsx:99-108`. Иконка пакета в BuyScreen — placeholder-точка (`BuyScreen.tsx:175-190`). Стили — liquid-glass токены в `miniapp/src/styles/glass.css`.

## Goals / Non-Goals

**Goals:**
- Админ задаёт иконку (emoji или URL) каждому офферу и иконку+название хедера.
- Публичная выдача брендинга без админ-прав.
- Визуальная полировка BuyScreen и ProfileScreen в рамках существующей дизайн-системы.

**Non-Goals:**
- Загрузка файлов иконок на сервер (только emoji/URL строкой).
- Редизайн остальных экранов (Create, Settings, Admin, Clarify).
- Новые зависимости, zod, изменение схемы платежей.

## Decisions

1. **Иконка = одна строка `icon`, эвристика рендера на клиенте.** Строка, начинающаяся с `http://`/`https://` → `<img>`, иначе рендерится как emoji-текст. Альтернатива — два поля (`iconType` + `iconValue`) — отвергнута: лишняя сложность формы и миграции ради того, что однозначно определяется префиксом.
2. **Общий компонент `IconOrEmoji`** (`miniapp/src/components/IconOrEmoji.tsx`): props `icon?: string`, `size`, `fallback: ReactNode`. Используется в BuyScreen (карточка пакета) и в хедере App.tsx. Пустой/невалидный icon → fallback (текущая accent-точка). `<img>` с `onError` → fallback, чтобы битый URL не ломал верстку.
3. **Хранение per-offer icon — колонка в `offers`**, не settings: иконка — атрибут товара, живёт в CRUD оффера. Миграция — идемпотентный `try { db.run('ALTER TABLE offers ADD COLUMN icon TEXT') } catch {}` по образцу `stars_amount` (db.ts:80-82).
4. **Брендинг хедера — расширение `ShopSettings`** (`headerIcon`, `headerTitle`), не отдельная таблица: паттерн уже существует, админ-панель `ShopSettingsPanel` уже редактирует эту группу. Дефолты: `headerTitle = "agent music"`, `headerIcon = ""` (→ текущая `.ring`-точка).
5. **Новый публичный `GET /api/shop-config`** возвращает `{ headerIcon, headerTitle }`. Альтернатива — подмешивать в `/api/me` — отвергнута: `/api/me` завязан на пользователя, брендинг же нужен до/независимо от него; отдельный эндпоинт кэшируется и не тянет лишнего. Роут проходит только auth-мидлвару мини-аппа (как `/api/offers`), без админ-проверки.
6. **Валидация icon — ручная, в стиле routes.ts**: строка, trim, длина ≤ 200 символов; для URL дополнительно префикс `http`. Пустая строка = «сбросить иконку» (NULL в БД / удаление ключа настройки).
7. **UI-полировка — только правки инлайн-стилей и переиспользование токенов glass.css**; новые CSS-классы добавляются в glass.css только если стиль повторяется ≥2 раз (например `.offer-icon`). Формат цены: `formatPrice(amount, asset)` — число без хвостовых нулей + пробел + asset; Stars-кнопка `N ⭐` как сейчас.

## Risks / Trade-offs

- [Внешний URL иконки недоступен/медленный] → `onError`-fallback на дефолтную точку, `loading="lazy"`, фиксированный размер контейнера — нет layout shift.
- [Админ вставит не-emoji мусор] → рендерится как текст в фикс-контейнере с `overflow:hidden`; лимит 200 символов отсекает крайности. Строгую emoji-валидацию не делаем — не стоит сложности.
- [Публичный shop-config раскрывает настройки] → эндпоинт отдаёт только два whitelisted-поля, не всю группу настроек.
- [Полировка сломает светлую тему] → использовать только CSS-переменные (у них есть light-оверрайды в `:root[data-scheme="light"]`), проверить обе темы вручную.

## Migration Plan

Деплой обычный (`deploy/deploy.sh`): миграция колонки идемпотентна, выполняется при старте сервера. Откат — предыдущий релиз игнорирует колонку `icon` и лишние ключи настроек; данные не теряются.

## Open Questions

Нет — формат иконок (emoji/URL), состав хедера (иконка+название) и объём полировки (Buy + Profile) подтверждены пользователем.
