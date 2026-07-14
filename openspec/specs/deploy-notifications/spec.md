# deploy-notifications Specification

## Purpose
TBD - created by archiving change improve-deploy-script. Update Purpose after archive.
## Requirements
### Requirement: Telegram notification on deploy result

Если `NOTIFY=true` и `TELEGRAM_BOT_TOKEN` доступен, скрипт SHALL отправить уведомление админу в Telegram после завершения деплоя. Токен SHALL читаться из `.env` в корне проекта. Chat ID получателя SHALL быть первым ID из `ADMIN_CHAT_IDS` в том же `.env`.

Уведомление SHALL быть отправлено через Telegram Bot API: `POST https://api.telegram.org/bot<token>/sendMessage` с `parse_mode=HTML`.

#### Scenario: Successful deploy notification

- **WHEN** деплой успешен
- **AND** `NOTIFY=true`
- **AND** `TELEGRAM_BOT_TOKEN` задан
- **THEN** админу отправляется сообщение с: именем релиза, веткой, commit message, и отметкой ✅

#### Scenario: Failed deploy notification

- **WHEN** health check не пройден
- **AND** выполнен автоматический откат
- **AND** `NOTIFY=true`
- **AND** `TELEGRAM_BOT_TOKEN` задан
- **THEN** админу отправляется сообщение с: именем релиза, именем откаченного релиза, и отметкой ❌

#### Scenario: Token not found

- **WHEN** `TELEGRAM_BOT_TOKEN` не задан в `.env`
- **AND** `NOTIFY=true`
- **THEN** уведомление не отправляется
- **AND** выводится warning (не ошибка)

#### Scenario: Notification disabled

- **WHEN** `NOTIFY=false` в конфиге
- **THEN** уведомление не отправляется без предупреждений

### Requirement: Notification message format

Сообщение об успешном деплое SHALL содержать:
- Заголовок: `✅ Deploy <release_name> OK`
- Branch: `<имя ветки>`
- Commit: `<commit message>`

Сообщение о фейле SHALL содержать:
- Заголовок: `❌ Deploy <release_name> FAILED`
- Reason: `Health check failed`
- Action: `Rolled back to <previous_release_name>`

#### Scenario: Success message content

- **WHEN** отправляется успешное уведомление
- **THEN** текст содержит `✅ Deploy`, имя релиза, ветку, и commit message

#### Scenario: Failure message content

- **WHEN** отправляется уведомление о фейле
- **THEN** текст содержит `❌ Deploy`, имя упавшего релиза, `Rolled back to`, и имя предыдущего релиза

