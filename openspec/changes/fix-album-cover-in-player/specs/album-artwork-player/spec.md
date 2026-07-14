## ADDED Requirements

### Requirement: PlayerTrackInfo содержит artwork
`PlayerTrackInfo` SHALL включать опциональное поле `artwork?: string` для хранения URL обложки трека.

#### Scenario: Создание PlayerTrackInfo с artwork
- **WHEN** вызывается `player.setQueue()` с массивом объектов, содержащих поле `artwork`
- **THEN** `PlayerTrackInfo` каждого трека сохраняет значение `artwork`

#### Scenario: Создание PlayerTrackInfo без artwork
- **WHEN** вызывается `player.setQueue()` с массивом объектов без поля `artwork`
- **THEN** `artwork` в `PlayerTrackInfo` равен `undefined`

### Requirement: Обложка передаётся из ResultsScreen в плеер
`ResultsScreen` SHALL передавать поле `artwork` из объекта `Track` при вызовах `player.setQueue()` и `player.toggle()`.

#### Scenario: Запуск плейлиста из результатов поиска
- **WHEN** пользователь нажимает «Слушать» на экране результатов
- **THEN** каждый трек в `player.setQueue()` содержит поле `artwork` из API-ответа

#### Scenario: Переключение на другой трек из результатов
- **WHEN** пользователь выбирает трек из списка
- **THEN** `player.toggle()` вызывается с объектом, содержащим поле `artwork`

### Requirement: Обложка передаётся из ProfileScreen в плеер
`ProfileScreen` SHALL передавать поле `artwork` из объекта `Track` при вызовах `player.setQueue()` и `player.toggle()`.

#### Scenario: Запуск плейлиста из профиля
- **WHEN** пользователь нажимает на плейлист в профиле
- **THEN** каждый трек в `player.setQueue()` содержит поле `artwork` из API-ответа

### Requirement: Полноэкранный плеер отображает обложку
`PlayerScreen` SHALL отображать изображение обложки текущего трека вместо статического плейсхолдера.

#### Scenario: Отображение обложки при наличии artwork
- **WHEN** в `PlayerScreen` передан трек с полем `artwork`
- **THEN** вместо `<div className="player-screen-artwork-placeholder" />` отображается `<img>` с `src` равным `artwork`
- **AND** тег `<img>` имеет `loading="lazy"` для отложенной загрузки

#### Scenario: Fallback при отсутствии artwork
- **WHEN** у текущего трека нет поля `artwork` (undefined)
- **THEN** отображается существующий CSS-плейсхолдер (conic-gradient)

#### Scenario: Fallback при ошибке загрузки изображения
- **WHEN** `<img>` генерирует событие `onError` (битый URL, сетевой сбой)
- **THEN** изображение скрывается, отображается CSS-плейсхолдер
- **AND** ошибка не вызывает исключений или падения UI

### Requirement: Мини-плеер отображает миниатюру обложки
`PlayerBar` SHALL отображать маленькую миниатюру обложки текущего трека слева от информации о треке.

#### Scenario: Отображение миниатюры
- **WHEN** в `PlayerBar` текущий трек имеет поле `artwork`
- **THEN** слева от названия и исполнителя отображается `<img>` 36×36px с `src` равным `artwork`

#### Scenario: Fallback миниатюры при ошибке
- **WHEN** `artwork` отсутствует или `onError`
- **THEN** миниатюра не отображается (или показывается прозрачный плейсхолдер)

### Requirement: MediaSession использует реальную обложку
`MediaSession` SHALL использовать реальную обложку трека вместо `FALLBACK_ARTWORK`, если URL обложки доступен и загружается.

#### Scenario: Установка MediaMetadata с обложкой
- **WHEN** трек меняется и у нового трека есть `artwork`
- **THEN** плеер выполняет `fetch(artwork)`, преобразует ответ в `Blob`
- **AND** создаёт `URL.createObjectURL(blob)` и устанавливает его в `MediaMetadata.artwork`
- **AND** предыдущий object URL `revokeObjectURL` удаляется для предотвращения утечки памяти

#### Scenario: MediaSession с fallback при ошибке загрузки
- **WHEN** `fetch(artwork)` завершается ошибкой (сеть, CORS)
- **THEN** `MediaMetadata.artwork` остаётся с `FALLBACK_ARTWORK`
- **AND** ошибка логируется в консоль как предупреждение
