# deploy-cleanup Delta

## MODIFIED Requirements

### Requirement: Cleanup old releases after successful deploy

После успешного деплоя (health check пройден) скрипт SHALL удалить старые релизы на VPS, оставив только `KEEP_RELEASES` последних. Cleanup SHALL выполняться отдельно для `$API_DIR/releases/` и `$STATIC_DIR/releases/`.

«Последние» релизы SHALL определяться по времени модификации директории (mtime, новые — последние), а НЕ по лексикографической сортировке имени: имена релизов сменили формат (`YYYYMMDDHHMMSS` → `YYYYMMDD-HHMMSS-<sha>`), и лексикографический порядок для смешанных форматов неверен (дефис сортируется раньше цифры).

Релиз, на который указывает симлинк `current` (после разрешения симлинка), SHALL всегда исключаться из удаления, даже если `KEEP_RELEASES` мал или mtime-порядок ставит его в «старые».

#### Scenario: Releases cleaned after success

- **WHEN** деплой успешен и `KEEP_RELEASES=5`
- **AND** в `releases/` лежит 10 директорий
- **THEN** после деплоя остаётся 5 директорий с самым свежим mtime (включая новый релиз)
- **AND** остальные 5 удалены

#### Scenario: Mixed release name formats

- **WHEN** в `releases/` лежат директории старого формата (`20260714172446`) и нового (`20260714-105705-b5adc42`)
- **AND** новый релиз создан последним
- **THEN** новый релиз НЕ удаляется (порядок по mtime, не по имени)
- **AND** удаляются директории с самым старым mtime

#### Scenario: Current target never deleted

- **WHEN** cleanup выполняется
- **AND** директория входит в кандидаты на удаление, но `current` разрешается в неё
- **THEN** эта директория не удаляется

#### Scenario: Fewer releases than KEEP_RELEASES

- **WHEN** деплой успешен и в `releases/` меньше директорий, чем `KEEP_RELEASES`
- **THEN** ни одна директория не удаляется

#### Scenario: KEEP_RELEASES=0

- **WHEN** `KEEP_RELEASES=0`
- **THEN** cleanup не выполняется (все релизы сохраняются)

#### Scenario: Cleanup on rollback path

- **WHEN** деплой не прошёл health check и выполнен откат
- **THEN** cleanup не выполняется — предыдущий релиз остаётся на месте
