## 1. Config

- [x] 1.1 Создать `deploy/deploy.conf` с переменными HOST, API_DIR, STATIC_DIR, SSH_OPTS, KEEP_RELEASES, NOTIFY и дефолтными значениями
- [x] 1.2 Добавить `deploy/deploy.conf` в `.gitignore`
- [x] 1.3 Добавить source конфига и подстановку `${VAR:=default}` в начало `deploy.sh`

## 2. Infrastructure: logging, error handling, flags

- [x] 2.1 Добавить функции `log()`, `warn()`, `fail()` для единообразного вывода
- [x] 2.2 Добавить функцию `run_ssh()` с общими SSH_OPTS
- [x] 2.3 Добавить парсинг флагов: `--dry-run`, `--no-typecheck`, `--dirty` (через простой case/match в начале скрипта)
- [x] 2.4 Реализовать `--dry-run`: вывод команд без их выполнения (кроме pre-flight)
- [x] 2.5 Использовать `TZ=UTC` для генерации таймстампов

## 3. Pre-flight checks

- [x] 3.1 Реализовать `check_git_clean`: проверка `git diff --stat`, учёт флага `--dirty`
- [x] 3.2 Реализовать `check_git_branch`: вывод текущей ветки, предупреждение и подтверждение Y/n для не-main веток
- [x] 3.3 Реализовать `check_typecheck`: запуск `bun run typecheck`, учёт флага `--no-typecheck`
- [x] 3.4 Реализовать `check_ssh`: проверка `ssh $SSH_OPTS $HOST "exit"`
- [x] 3.5 Реализовать `check_remote_env`: проверка `test -f $API_DIR/.env` на VPS
- [x] 3.6 Вызвать все pre-flight проверки в правильном порядке перед build

## 4. Release name и синхронизация

- [x] 4.1 Изменить формат RELEASE на `$(TZ=UTC date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)`
- [x] 4.2 Сохранить `COMMIT_MSG=$(git log --oneline -1)` для уведомлений
- [x] 4.3 Группировать создание release-директорий в один ssh-вызов: `mkdir -p $API_DIR/releases/$RELEASE $STATIC_DIR/releases/$RELEASE`

## 5. Remote setup: зависимости + аудио-тулинг

- [x] 5.1 Группировать yt-dlp + ffmpeg + mkdir scratch/cache в одну ssh-команду
- [x] 5.2 Убедиться, что `bun install --production` выполняется в свежей релизной директории

## 6. Symlink + restart

- [x] 6.1 Переключить `$API_DIR/current` и `$STATIC_DIR/current` на новый релиз (два `ln -sfn` в одном ssh, или два последовательных)
- [x] 6.2 Перезапустить systemd-юнит: `systemctl restart agent-music-tg && sleep 3`

## 7. Health check + auto-rollback

- [x] 7.1 Выполнить `curl -fsS --max-time 10 http://127.0.0.1:8787/healthz` на VPS
- [x] 7.2 При успехе: вывести сообщение, перейти к cleanup и уведомлению
- [x] 7.3 При фейле: определить предыдущий релиз через `ls -d releases/*/ | sort | tail -n 2 | head -n 1`
- [x] 7.4 При фейле: переключить оба симлинка на предыдущий релиз в одной ssh-команде
- [x] 7.5 При фейле: перезапустить systemd-юнит
- [x] 7.6 При фейле и невозможности отката (нет предыдущего релиза): вывести критическое предупреждение
- [x] 7.7 Обработать случай, когда rollback health check тоже падает

## 8. Cleanup старых релизов

- [x] 8.1 После успешного деплоя выполнить cleanup: `ls -d $API_DIR/releases/*/ | head -n -$KEEP_RELEASES | xargs -r rm -rf`
- [x] 8.2 Выполнить cleanup для `$STATIC_DIR` аналогично
- [x] 8.3 Cleanup не выполняется при rollback

## 9. Telegram-уведомления

- [x] 9.1 Читать `TELEGRAM_BOT_TOKEN` и первый `ADMIN_CHAT_IDS` из `.env` в корне проекта
- [x] 9.2 Реализовать `notify_telegram()`: POST на `api.telegram.org/bot<token>/sendMessage` с `parse_mode=HTML`
- [x] 9.3 Вызвать уведомление об успехе с именем релиза, веткой, commit message
- [x] 9.4 Вызвать уведомление о фейле с именем релиза, причиной, именем откаченного релиза
- [x] 9.5 Учесть флаг `NOTIFY` и отсутствие токена (warning, не ошибка)

## 10. Документация

- [x] 10.1 Обновить `AGENTS.md` — команда `./deploy/deploy.sh` с новыми флагами
- [x] 10.2 Обновить `README.md` — секция Deploy: dry-run, auto-rollback, флаги
