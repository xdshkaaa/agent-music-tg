## Context

Current Mini App имеет дублирование UI-компонентов (volume-контроль в PlayerBar и PlayerScreen, пустые состояния в ProfileScreen/BuyScreen, панели пользователей в AdminScreen) и полагается на браузерные нативные диалоги (prompt/alert/confirm), которые выбиваются из glass-стилистики. Ошибки отображаются без возможности повтора. Скелетон не имеет debounce.

## Goals / Non-Goals

**Goals:**
- Устранить дублирование volume-контроля через общий компонент `VolumeControl`
- Устранить дублирование empty state через общий компонент `EmptyState`
- Заменить нативные prompt/alert/confirm в AdminScreen на inline-интерфейсы
- Добавить retry-кнопки к фулскрин-ошибкам
- Добавить debounce для TrackSkeleton (200ms delay, 400ms min duration)
- Добавить spinner в ClarifyScreen при `busy`
- Убрать localStorage-флаг `am_last_paid_count`

**Non-Goals:**
- Редизайн админки (структура табов меняться не будет)
- Полная переработка плеера (только вынос volume)
- Изменение API или бэкенда
- Добавление новых экранов или фич

## Decisions

1. **VolumeControl — общий компонент, не хук**
   - PlayerBar и PlayerScreen показывают одинаковые иконки (`SpeakerX`/`SpeakerHigh`/`SpeakerLow`) + `<input type="range">`.
   - Выносим в `components/VolumeControl.tsx`. Принимает пропсы `volume`, `muted`, `onSetVolume`, `onToggleMute`.
   - Альтернатива: хук `useVolume` — не подходит, т.к. рендер иконок и слайдера всё равно нужно в JSX.

2. **EmptyState — простой компонент с иконкой и текстом**
   - Текущие inline-блоки в ProfileScreen и BuyScreen идентичны по структуре: иконка (40px, `className="chevron"`) + muted текст + опциональная кнопка.
   - `components/EmptyState.tsx`: `{ icon, label, action? }`.
   - Альтернатива: оставить как есть — неоправданная когнитивная нагрузка при поддержке.

3. **ErrorBanner — auto-dismiss + close button**
   - `components/ErrorBanner.tsx`: принимает `message`, `onClose`, `onRetry?`.
   - Авто-скрытие через `setTimeout` 8s, кнопка закрытия.
   - `role="alert"` для a11y.

4. **AdminScreen — замена prompt/alert/confirm на inline**
   - UsersPanel: заменить `prompt("Сколько credits начислить?")` на `<input type="number">` + кнопка, расположенные рядом с пользователем (как уже сделано в IssuancePanel).
   - AccessPanel: заменить `prompt("Telegram chat ID:")` на inline-форму.
   - UnifiedSettingsPanel: заменить `prompt("Новое значение")` на inline-редактор.
   - Подтверждение удаления: заменить `window.confirm` на inline-confirm с двумя кнопками.

5. **Debounce для TrackSkeleton**
   - Использовать `useEffect` с `setTimeout` 200ms перед показом и `minDuration` 400ms, чтобы не было flash на быстрых запросах.
   - Аналогично craft-checklist п.75.

6. **Убрать localStorage `am_last_paid_count`**
   - Заменить на сравнение `paidInvoices.length` с предыдущим значением, хранящимся в ref (`useRef`), а не в localStorage.
   - Или просто показывать success notification сразу после успешного платежа (без сверки с историей).

## Risks / Trade-offs

- [Risk] Вынос VolumeControl может изменить поведение при клике (stopPropagation в PlayerBar) → Mitigation: сохранить проп `stopPropagation`.
- [Risk] Замена localStorage на useRef сбросит notification после F5 → Trade-off: это нормально для Telegram Mini App, т.к. страница редко обновляется вручную, а платежи подтверждаются через bot.
- [Risk] Inline-формы в AdminScreen увеличат количество JSX → Trade-off: улучшение UX на мобильных важнее.
