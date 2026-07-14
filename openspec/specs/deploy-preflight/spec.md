# deploy-preflight Specification

## Purpose
TBD - created by archiving change improve-deploy-script. Update Purpose after archive.
## Requirements
### Requirement: Pre-flight pipeline

Перед любыми операциями деплоя скрипт SHALL выполнить последовательность pre-flight проверок. Если любая проверка падает — скрипт SHALL завершиться с ошибкой и не начинать деплой. Проверки SHALL выполняться в указанном порядке и с понятным сообщением о том, какая проверка не пройдена.

#### Scenario: All checks pass

- **WHEN** все pre-flight проверки пройдены
- **THEN** скрипт продолжает деплой

#### Scenario: Any check fails

- **WHEN** любая pre-flight проверка не пройдена
- **THEN** скрипт выводит сообщение о проваленной проверке
- **AND** скрипт завершается с кодом 1
- **AND** деплой не начинается

### Requirement: Git status check

Скрипт SHALL проверить, что рабочая директория чиста (нет незакоммиченных изменений). При наличии изменённых или неотслеживаемых файлов скрипт SHALL завершиться с ошибкой, если не передан флаг `--dirty`.

#### Scenario: Clean working tree

- **WHEN** `git diff --stat` и `git diff --cached --stat` пусты
- **THEN** проверка пройдена

#### Scenario: Dirty working tree without flag

- **WHEN** есть незакоммиченные изменения
- **AND** флаг `--dirty` не передан
- **THEN** проверка не пройдена
- **AND** выводится список изменённых файлов

#### Scenario: Dirty working tree with --dirty flag

- **WHEN** есть незакоммиченные изменения
- **AND** флаг `--dirty` передан
- **THEN** проверка пропускается (warning вместо ошибки)

### Requirement: Git branch check

Скрипт SHALL вывести название текущей ветки. Если ветка не `main` и не `master`, скрипт SHALL вывести предупреждение и запросить подтверждение (Y/n) перед продолжением, если не передан флаг `--dirty`.

#### Scenario: On main/master branch

- **WHEN** текущая ветка — `main` или `master`
- **THEN** проверка пройдена без предупреждений

#### Scenario: On feature branch without flag

- **WHEN** текущая ветка — не `main` и не `master`
- **AND** флаг `--dirty` не передан
- **THEN** выводится предупреждение
- **AND** скрипт запрашивает подтверждение Y/n

#### Scenario: On feature branch with --dirty

- **WHEN** текущая ветка — не `main` и не `master`
- **AND** флаг `--dirty` передан
- **THEN** предупреждение выводится, но подтверждение не требуется

### Requirement: TypeScript type check

Скрипт SHALL запустить `bun run typecheck` перед деплоем. При ошибках типизации скрипт SHALL завершиться с ошибкой, если не передан флаг `--no-typecheck`.

#### Scenario: Typecheck passes

- **WHEN** `bun run typecheck` завершается с кодом 0
- **THEN** проверка пройдена

#### Scenario: Typecheck fails without flag

- **WHEN** `bun run typecheck` завершается с ненулевым кодом
- **AND** флаг `--no-typecheck` не передан
- **THEN** проверка не пройдена

#### Scenario: Typecheck skipped with flag

- **WHEN** флаг `--no-typecheck` передан
- **THEN** проверка typecheck пропускается

### Requirement: SSH connectivity check

Скрипт SHALL проверить доступность VPS по SSH до начала деплоя. Проверка SHALL выполняться с теми же SSH_OPTS, что и основные операции. При недоступности хоста скрипт SHALL завершиться с ошибкой.

#### Scenario: Host reachable

- **WHEN** `ssh $SSH_OPTS $HOST "exit"` завершается с кодом 0
- **THEN** проверка пройдена

#### Scenario: Host unreachable

- **WHEN** `ssh $SSH_OPTS $HOST "exit"` завершается с ненулевым кодом
- **THEN** проверка не пройдена
- **AND** выводится сообщение о недоступности хоста

### Requirement: Remote .env existence check

Скрипт SHALL проверить наличие файла `.env` на VPS в директории `$API_DIR` до начала деплоя. При отсутствии файла скрипт SHALL завершиться с ошибкой.

#### Scenario: .env exists on VPS

- **WHEN** `ssh ... "test -f $API_DIR/.env"` завершается с кодом 0
- **THEN** проверка пройдена

#### Scenario: .env missing on VPS

- **WHEN** `ssh ... "test -f $API_DIR/.env"` завершается с ненулевым кодом
- **THEN** проверка не пройдена
- **AND** выводится сообщение о необходимости создать .env на VPS

