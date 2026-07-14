# deploy-health Delta

## MODIFIED Requirements

### Requirement: Health check after restart

После рестарта systemd-юнита скрипт SHALL выполнить health check из двух проверок:

1. API: `curl -fsS --max-time 10 http://127.0.0.1:8787/healthz` возвращает успех.
2. Статика Mini App: симлинк `$STATIC_DIR/current` разрешается в существующую директорию, содержащую `dist/index.html` (проверка на VPS, например `test -f "$STATIC_DIR/current/dist/index.html"`).

Деплой считается завершённым только если обе проверки успешны. Фейл любой из них SHALL запускать процедуру автоматического отката.

#### Scenario: Health check succeeds

- **WHEN** `curl -fsS --max-time 10 http://127.0.0.1:8787/healthz` возвращает HTTP 200
- **AND** `$STATIC_DIR/current/dist/index.html` существует
- **THEN** скрипт выводит сообщение об успешном деплое с именем релиза
- **AND** скрипт завершается с кодом 0

#### Scenario: Health check fails (timeout or non-200)

- **WHEN** `curl` завершается с ошибкой (таймаут, connection refused, non-200)
- **THEN** скрипт запускает процедуру автоматического отката

#### Scenario: Static build missing (dangling current symlink)

- **WHEN** API health check успешен
- **AND** `$STATIC_DIR/current/dist/index.html` не существует (висячий симлинк или пустой релиз)
- **THEN** скрипт запускает процедуру автоматического отката

### Requirement: Automatic rollback on health check failure

При фейле health check скрипт SHALL:
1. Определить предыдущий релиз — директорию в `$API_DIR/releases/` с самым свежим mtime, исключая только что задеплоенный релиз (`$RELEASE`). Определение SHALL идти по mtime, а НЕ по алфавитному порядку имён (смешанные форматы имён сортируются лексикографически неверно)
2. Переключить `$API_DIR/current` и `$STATIC_DIR/current` на предыдущий релиз
3. Перезапустить systemd-юнит
4. Выполнить повторный health check
5. Отправить Telegram-уведомление о фейле и откате
6. Завершиться с кодом 1

Определение предыдущего релиза и переключение симлинков SHALL выполняться в одной ssh-команде.

#### Scenario: Rollback to previous release

- **WHEN** health check нового релиза не пройден
- **THEN** `current` переключается на предыдущий по mtime релиз (не на текущий фейлящий)
- **AND** systemd-юнит перезапускается
- **AND** выводится сообщение об откате
- **AND** скрипт завершается с кодом 1

#### Scenario: Rollback with mixed release name formats

- **WHEN** health check фейлится
- **AND** в `releases/` лежат директории старого (`20260714172446`) и нового (`20260714-105705-b5adc42`) форматов
- **THEN** предыдущий релиз выбирается по mtime, не по имени

#### Scenario: No previous release to rollback to

- **WHEN** health check фейлится
- **AND** нет других релизов в `$API_DIR/releases/` (первый деплой)
- **THEN** скрипт выводит предупреждение, что откат невозможен
- **AND** скрипт завершается с кодом 1

#### Scenario: Rollback health check also fails

- **WHEN** health check откаченного релиза тоже не пройден
- **THEN** скрипт выводит критическое предупреждение — сервер в нерабочем состоянии
- **AND** скрипт завершается с кодом 1
