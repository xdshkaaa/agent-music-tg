# offer-icons

## ADDED Requirements

### Requirement: Offer has an admin-managed icon
Оффер магазина SHALL иметь необязательное строковое поле `icon` (emoji или URL картинки, до 200 символов), сохраняемое вместе с оффером и возвращаемое во всех API-ответах, содержащих оффер.

#### Scenario: Admin sets emoji icon
- **WHEN** админ создаёт или редактирует оффер и указывает в поле иконки emoji (например `🎵`)
- **THEN** сервер сохраняет значение, и `GET /api/offers` возвращает оффер с `icon: "🎵"`

#### Scenario: Admin sets image URL icon
- **WHEN** админ указывает в поле иконки URL, начинающийся с `http://` или `https://`
- **THEN** сервер сохраняет значение и возвращает его в поле `icon` оффера

#### Scenario: Admin clears icon
- **WHEN** админ сохраняет оффер с пустым полем иконки
- **THEN** поле `icon` сбрасывается, и API возвращает оффер без иконки

#### Scenario: Icon too long is rejected
- **WHEN** админ отправляет значение иконки длиннее 200 символов
- **THEN** сервер отвечает ошибкой 400 и не сохраняет оффер

### Requirement: Store renders offer icons
Экран магазина SHALL отображать иконку оффера в карточке пакета: значение с префиксом `http` рендерится как изображение фиксированного размера, иначе — как emoji-текст; отсутствующая или незагрузившаяся иконка заменяется дефолтной accent-точкой.

#### Scenario: Emoji icon rendered
- **WHEN** оффер имеет `icon: "🎵"`
- **THEN** карточка пакета показывает `🎵` в контейнере иконки

#### Scenario: URL icon rendered as image
- **WHEN** оффер имеет `icon` с префиксом `https://`
- **THEN** карточка показывает `<img>` с этим URL в контейнере фиксированного размера без сдвига макета

#### Scenario: Broken URL falls back
- **WHEN** URL иконки не загружается (ошибка img)
- **THEN** карточка показывает дефолтную accent-точку вместо битого изображения

#### Scenario: Missing icon falls back
- **WHEN** у оффера нет иконки
- **THEN** карточка показывает дефолтную accent-точку
