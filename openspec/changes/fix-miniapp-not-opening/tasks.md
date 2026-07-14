# Tasks: fix-miniapp-not-opening

## 1. Фикс deploy.sh

- [x] 1.1 Cleanup: заменить лексикографический `ls | head -n -N` на mtime-порядок (`ls -1dt 'releases/'*/ | tail -n +$((KEEP_RELEASES+1))`) для `$API_DIR` и `$STATIC_DIR`
- [x] 1.2 Cleanup: исключить из кандидатов на удаление директорию, в которую разрешается `current` (`readlink -f` + `grep -vxF`)
- [x] 1.3 Rollback: выбирать предыдущий релиз по mtime, исключая `$RELEASE`, вместо `ls | sort | tail -n 2 | head -n 1`
- [x] 1.4 Health check: добавить проверку `test -f "$STATIC_DIR/current/dist/index.html"` рядом с curl `/healthz`; фейл → откат

## 2. Проверка скрипта

- [x] 2.1 `bash -n deploy/deploy.sh` — синтаксис
- [x] 2.2 `./deploy/deploy.sh --dry-run` — pre-flight проходит

## 3. Восстановление прода

- [x] 3.1 Задеплоить фиксированным скриптом (`./deploy/deploy.sh`, при необходимости `--dirty`)
- [x] 3.2 Проверить: оба `current` на VPS разрешаются в существующие директории нового релиза
- [x] 3.3 Проверить: `curl -I https://miniapp.xdshka.party/` → 200, Mini App открывается в Telegram
- [x] 3.4 Проверить: после prune новый релиз на месте, `KEEP_RELEASES` соблюдён
