## Why

Текущий `deploy/deploy.sh` — хрупкий однопоточный скрипт с хардкодом, без pre-flight checks, без автоматического отката, без очистки старых релизов. Любой сбой на середине (упавший ssh, битый билд, не прошедший health check) оставляет VPS в неконсистентном состоянии: симлинки уже переставлены, сервис рестартнут, но не работает. Админ узнаёт о проблеме постфактум.

## What Changes

- **Config** — вынести HOST, API_DIR, STATIC_DIR, SSH_OPTS, KEEP_RELEASES в `deploy/deploy.conf`, который source'ится скриптом (файл в `.gitignore`). Переменные с дефолтами через `${VAR:=default}`.
- **Pre-flight checks** — добавить проверки перед деплоем: git status (чистота), git branch (на какой ветке), `bun run typecheck`, SSH connectivity, наличие `.env` на VPS.
- **Release name** — добавить `git rev-parse --short HEAD` в имя релиза: `20250714-171509-a1b2c3d`.
- **Auto-rollback** — при падении health check переключить `current` на предыдущий релиз и перезапустить сервис.
- **Cleanup** — после успешного деплоя удалять старые релизы, оставляя N последних (по умолчанию 5).
- **Telegram-уведомления** — читать TELEGRAM_BOT_TOKEN из локального `.env` и отправлять админу сообщение об успехе/фейле.
- **Flags** — `--dry-run`, `--no-typecheck`, `--dirty`.

## Capabilities

### New Capabilities
- `deploy-config`: Внешний конфиг-файл для параметров деплоя
- `deploy-preflight`: Pre-flight проверки перед запуском деплоя
- `deploy-release`: Процесс релиза (build + sync + install + restart) с улучшенным именованием
- `deploy-health`: Health check с автоматическим откатом при фейле
- `deploy-cleanup`: Очистка старых релизов на VPS
- `deploy-notifications`: Уведомления админу о результате деплоя через Telegram

### Modified Capabilities
<!-- Нет изменяемых существующих specs — deploy-pipeline целиком новый. -->

## Impact

- `deploy/deploy.sh` — полное переписывание с сохранением обратной совместимости
- `deploy/deploy.conf` — новый файл (`.gitignore`)
- `.gitignore` — добавить `deploy/deploy.conf`
- `AGENTS.md` — обновить описание команды `./deploy/deploy.sh`
- `README.md` — обновить секцию Deploy с новыми возможностями (dry-run, rollback)
