## ADDED Requirements

### Requirement: Health check after restart

После рестарта systemd-юнита скрипт SHALL выполнить health check через `curl -fsS --max-time 10 http://127.0.0.1:8787/healthz`. Если health check успешен — деплой считается завершённым.

#### Scenario: Health check succeeds

- **WHEN** `curl -fsS --max-time 10 http://127.0.0.1:8787/healthz` возвращает HTTP 200
- **THEN** скрипт выводит сообщение об успешном деплое с именем релиза
- **AND** скрипт завершается с кодом 0

#### Scenario: Health check fails (timeout or non-200)

- **WHEN** `curl` завершается с ошибкой (таймаут, connection refused, non-200)
- **THEN** скрипт запускает процедуру автоматического отката

### Requirement: Automatic rollback on health check failure

При фейле health check скрипт SHALL:
1. Определить предыдущий релиз (директория, идущая перед текущей в алфавитном порядке)
2. Переключить `$API_DIR/current` и `$STATIC_DIR/current` на предыдущий релиз
3. Перезапустить systemd-юнит
4. Выполнить повторный health check
5. Отправить Telegram-уведомление о фейле и откате
6. Завершиться с кодом 1

Определение предыдущего релиза и переключение симлинков SHALL выполняться в одной ssh-команде.

#### Scenario: Rollback to previous release

- **WHEN** health check нового релиза не пройден
- **THEN** `current` переключается на предыдущий релиз
- **AND** systemd-юнит перезапускается
- **AND** выводится сообщение об откате
- **AND** скрипт завершается с кодом 1

#### Scenario: No previous release to rollback to

- **WHEN** health check фейлится
- **AND** нет других релизов в `$API_DIR/releases/` (первый деплой)
- **THEN** скрипт выводит предупреждение, что откат невозможен
- **AND** скрипт завершается с кодом 1

#### Scenario: Rollback health check also fails

- **WHEN** health check откаченного релиза тоже не пройден
- **THEN** скрипт выводит критическое предупреждение — сервер в нерабочем состоянии
- **AND** скрипт завершается с кодом 1
