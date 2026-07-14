# Tasks: move-admin-settings-to-top-bar

## 1. Создать компонент AdminSettingsBar

- [x] 1.1 Создать `miniapp/src/components/AdminSettingsBar.tsx`: компактный GlassPanel с двумя Segmented-контролами (провайдер ИИ + музыка), props `settings: AdminSettings | null`, `onChange: (...) => void`. Без заголовка «Настройки администратора».

## 2. Поднять состояние settings в AdminScreen

- [x] 2.1 Перенести `useState<AdminSettings | null>` и `useEffect` (загрузка `api.adminSettings()`) из `SettingsScreen` в `AdminScreen` (`AdminScreen.tsx:578-597`)
- [x] 2.2 Передать settings и onChange в `AdminSettingsBar`
- [x] 2.3 Переписать onChange-логику: вызов `api.setActiveProvider(id)` / `api.setActiveBackend(id)` с обновлением локального стейта (как в SettingsScreen:33-34, :43-44)

## 3. Встроить AdminSettingsBar в AdminScreen

- [x] 3.1 Разместить `<AdminSettingsBar settings={...} onChange={...} />` перед `<AdminTabBar>` в jsx-дереве (`AdminScreen.tsx:581-583`)
- [x] 3.2 Удалить `<Suspense fallback={...}><SettingsScreen /></Suspense>` из низа (`AdminScreen.tsx:593-595`)
- [x] 3.3 Удалить `import SettingsScreen` и `lazy(() => import("./SettingsScreen"))` (`AdminScreen.tsx:33`)

## 4. Стилизация

- [x] 4.1 Добавить CSS-класс `.admin-settings-bar` в `glass.css` (∼:848) — flex-row контейнер с двумя Segmented, компактные отступы, wrap на узких экранах

## 5. Очистка

- [x] 5.1 Удалить файл `miniapp/src/screens/SettingsScreen.tsx` (больше не используется)
- [x] 5.2 Проверить `bun run build` в `miniapp/` — сборка без ошибок
- [x] 5.3 Визуально проверить: панель настроек отображается на всех табах только один раз, контролы переключают провайдера/бэкенд
