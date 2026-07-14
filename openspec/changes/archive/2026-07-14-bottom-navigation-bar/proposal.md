## Why

Нижняя панель навигации (dock) в Telegram Mini App использует `position: sticky`, из-за чего при скролле контента она уезжает вниз и перестаёт быть видимой. Пользователь теряет возможность быстро переключаться между разделами, не скролля наверх. Нужно, чтобы панель всегда была видна внизу экрана независимо от скролла.

## What Changes

- Изменить позиционирование нижнего бара с `sticky` на `fixed` — панель всегда видна внизу viewport
- Вынести нижний бар из основного потока документа, чтобы контент не перекрывался
- Увеличить `padding-bottom` у `.app-shell` на высоту бара, чтобы последний контент не скрывался за фиксированной панелью
- Извлечь разметку dock в отдельный компонент `BottomNav` для чистоты `App.tsx`

## Capabilities

### New Capabilities
- `persistent-bottom-nav`: Постоянно видимая нижняя навигационная панель, закреплённая внизу viewport

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- `miniapp/src/App.tsx` — удалить встроенную разметку dock, заменить на `<BottomNav />`
- `miniapp/src/components/BottomNav.tsx` — новый компонент с `position: fixed`
- `miniapp/src/styles/glass.css` — изменить `.dock` с `sticky` на `fixed`, добавить отступ для `.app-shell`
- `miniapp/src/components/PlayerBar.tsx` — возможно, скорректировать bottom-отступ, если плеер опирается на нижний край
