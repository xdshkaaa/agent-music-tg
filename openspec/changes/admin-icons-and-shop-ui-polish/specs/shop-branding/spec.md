# shop-branding

## ADDED Requirements

### Requirement: Admin configures header icon and title
Настройки магазина SHALL включать поля `headerIcon` (emoji или URL, до 200 символов) и `headerTitle` (строка), редактируемые админом в панели настроек магазина и сохраняемые в key-value settings.

#### Scenario: Admin updates header branding
- **WHEN** админ сохраняет в панели «Магазин» новые headerIcon и headerTitle
- **THEN** значения сохраняются в настройках и возвращаются при последующем чтении настроек магазина

#### Scenario: Defaults when unset
- **WHEN** headerIcon и headerTitle не заданы
- **THEN** используется название «agent music» и дефолтная accent-точка как иконка

### Requirement: Public shop-config endpoint
Сервер SHALL предоставлять эндпоинт `GET /api/shop-config`, доступный любому аутентифицированному пользователю мини-аппа (без админ-прав), возвращающий только `{ headerIcon, headerTitle }`.

#### Scenario: Non-admin fetches shop config
- **WHEN** обычный пользователь запрашивает `GET /api/shop-config`
- **THEN** сервер отвечает 200 с полями headerIcon и headerTitle и не раскрывает другие настройки

### Requirement: Mini App header renders configured branding
Хедер мини-аппа SHALL отображать headerTitle вместо захардкоженного «agent music» и headerIcon (emoji или изображение) вместо захардкоженной точки; до загрузки конфига и при пустых значениях показываются дефолты без мигания.

#### Scenario: Custom branding shown
- **WHEN** админ задал headerIcon `🎧` и headerTitle «my shop»
- **THEN** хедер всех экранов показывает `🎧 my shop`

#### Scenario: URL header icon
- **WHEN** headerIcon — URL с префиксом `https://`
- **THEN** хедер показывает изображение фиксированного размера; при ошибке загрузки — дефолтную точку

#### Scenario: Unset branding shows defaults
- **WHEN** shop-config возвращает пустые значения
- **THEN** хедер показывает текущий вид: accent-точка + «agent music»
