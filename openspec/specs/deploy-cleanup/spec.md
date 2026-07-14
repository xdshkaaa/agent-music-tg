# deploy-cleanup Specification

## Purpose
TBD - created by archiving change improve-deploy-script. Update Purpose after archive.
## Requirements
### Requirement: Cleanup old releases after successful deploy

После успешного деплоя (health check пройден) скрипт SHALL удалить старые релизы на VPS, оставив только `KEEP_RELEASES` последних. Cleanup SHALL выполняться отдельно для `$API_DIR/releases/` и `$STATIC_DIR/releases/`.

Текущий релиз (`current`) SHALL всегда сохраняться, даже если `KEEP_RELEASES` мал.

#### Scenario: Releases cleaned after success

- **WHEN** деплой успешен и `KEEP_RELEASES=5`
- **AND** в `releases/` лежит 10 директорий
- **THEN** после деплоя остаётся 5 последних (включая новый) директорий
- **AND** остальные 5 удалены

#### Scenario: Fewer releases than KEEP_RELEASES

- **WHEN** деплой успешен и в `releases/` меньше директорий, чем `KEEP_RELEASES`
- **THEN** ни одна директория не удаляется

#### Scenario: KEEP_RELEASES=0

- **WHEN** `KEEP_RELEASES=0`
- **THEN** cleanup не выполняется (все релизы сохраняются)

#### Scenario: Cleanup on rollback path

- **WHEN** деплой не прошёл health check и выполнен откат
- **THEN** cleanup не выполняется — предыдущий релиз остаётся на месте

