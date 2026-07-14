# deploy-release Specification

## Purpose
TBD - created by archiving change improve-deploy-script. Update Purpose after archive.
## Requirements
### Requirement: Release name with commit SHA

Каждый деплой SHALL создавать релизную директорию с именем формата `YYYYMMDD-HHMMSS-GITSHA`, где `GITSHA` — результат `git rev-parse --short HEAD`. Таймстамп SHALL генерироваться в UTC.

Пример: `20250714-171509-a1b2c3d`

#### Scenario: Release directory created with correct name

- **WHEN** скрипт создаёт релизные директории на VPS
- **THEN** имя директории соответствует формату `YYYYMMDD-HHMMSS-<short_sha>`

### Requirement: Build Mini App

Скрипт SHALL собрать Mini App перед синхронизацией. Сборка SHALL выполняться через `cd miniapp && bun install --frozen-lockfile && bun run build`. При ошибке сборки скрипт SHALL завершиться с ошибкой.

#### Scenario: Build succeeds

- **WHEN** `bun run build` в miniapp завершается с кодом 0
- **THEN** скрипт продолжает синхронизацию

#### Scenario: Build fails

- **WHEN** `bun run build` в miniapp завершается с ненулевым кодом
- **THEN** скрипт завершается с ошибкой
- **AND** деплой не продолжается

### Requirement: Rsync server code

Скрипт SHALL синхронизировать серверный код на VPS. Источник: `server/`, `package.json`, `bun.lock`, `tsconfig.json`. Исключения: `node_modules`, `.git`, `openspec`, `data`. Таргет: `$API_DIR/releases/$RELEASE/`.

#### Scenario: Server code synced

- **WHEN** `rsync -az --delete` выполняется для серверного кода
- **THEN** все файлы из списка source скопированы в `$API_DIR/releases/$RELEASE/`
- **AND** исключённые директории не скопированы

### Requirement: Rsync Mini App static build

Скрипт SHALL синхронизировать собранную статику Mini App на VPS. Источник: `miniapp/dist/`. Таргет: `$STATIC_DIR/releases/$RELEASE/dist/`.

#### Scenario: Static build synced

- **WHEN** `rsync -az --delete` выполняется для статики
- **THEN** содержимое `miniapp/dist/` скопировано в `$STATIC_DIR/releases/$RELEASE/dist/`

### Requirement: Ensure audio tooling on VPS

Скрипт SHALL обеспечить наличие ffmpeg и yt-dlp на VPS (как и в текущем скрипте), и создать директории `audio-scratch` и `stream-cache`.

#### Scenario: Tooling already installed

- **WHEN** ffmpeg и yt-dlp уже установлены на VPS
- **THEN** apt-get и yt-dlp обновление выполняются, но без повторной установки

#### Scenario: Tooling missing

- **WHEN** ffmpeg или yt-dlp отсутствуют
- **THEN** они устанавливаются через apt-get или curl

### Requirement: Install production dependencies on VPS

Скрипт SHALL выполнить `bun install --production` в свежесинхронизированной релизной директории на VPS.

#### Scenario: Dependencies installed

- **WHEN** `bun install --production` выполняется на VPS
- **THEN** все production зависимости установлены в `$API_DIR/releases/$RELEASE/node_modules/`

### Requirement: Symlink current

Скрипт SHALL переключить симлинк `$API_DIR/current` и `$STATIC_DIR/current` на новый релиз. Переключение SHALL быть атомарным (одна ssh-команда на симлинк, `ln -sfn`).

#### Scenario: Symlinks updated

- **WHEN** деплой завершён успешно
- **THEN** `$API_DIR/current` указывает на `$API_DIR/releases/$RELEASE`
- **AND** `$STATIC_DIR/current` указывает на `$STATIC_DIR/releases/$RELEASE`

