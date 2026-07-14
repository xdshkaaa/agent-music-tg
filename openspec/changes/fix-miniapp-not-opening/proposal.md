# fix-miniapp-not-opening

## Why

Mini App в проде отдаёт 404 (https://miniapp.xdshka.party/ — «не открывается»). Причина: деплой-скрипт после успешного деплоя удалил только что задеплоенный релиз. Формат имени релиза сменился с `YYYYMMDDHHMMSS` на `YYYYMMDD-HHMMSS-<sha>`, а cleanup и rollback выбирают релизы по **лексикографической** сортировке `ls`. Дефис (`0x2D`) сортируется раньше цифры, поэтому новый релиз `20260714-105705-b5adc42` встал *раньше* старых `20260714164503…` и был удалён как «самый старый». Симлинки `current` в `/opt/agent-music-tg` и `/srv/www/miniapp.xdshka.party` теперь висячие: API-процесс пережил удаление (уже был запущен), а статика Mini App исчезла → 404.

## What Changes

- **Hotfix прод**: восстановить рабочий `current` на VPS (redeploy после фикса скрипта).
- `deploy/deploy.sh`: cleanup старых релизов SHALL сортировать по времени модификации (mtime), не по имени, и SHALL никогда не удалять релиз, на который указывает `current` (для обеих директорий: API и static).
- `deploy/deploy.sh`: выбор предыдущего релиза при rollback SHALL идти по mtime, не по алфавиту.
- Health check дополняется проверкой, что статика Mini App реально отдаётся (не только `/healthz` API): дангл-симлинк статики должен фейлить деплой, а не проходить молча.

## Capabilities

### New Capabilities

_(нет)_

### Modified Capabilities

- `deploy-cleanup`: порядок определения «старых» релизов — по mtime вместо неопределённого/алфавитного; явный запрет удаления таргета `current`.
- `deploy-health`: определение предыдущего релиза при rollback — по mtime вместо «алфавитного порядка»; health check SHALL проверять доступность статики Mini App, не только API `/healthz`.

## Impact

- `deploy/deploy.sh` — cleanup (строки ~165–168), rollback (строка ~179), health check (~158).
- VPS: `/opt/agent-music-tg/{current,releases}`, `/srv/www/miniapp.xdshka.party/{current,releases}` — одноразовое восстановление симлинков + вычистка релизов старого формата имён.
- Специфик: `openspec/specs/deploy-cleanup/spec.md`, `openspec/specs/deploy-health/spec.md`.
- Код приложения (server/, miniapp/) не меняется.
