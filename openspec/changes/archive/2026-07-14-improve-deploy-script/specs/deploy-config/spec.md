## ADDED Requirements

### Requirement: External configuration file

Система SHALL поддерживать внешний конфиг-файл `deploy/deploy.conf`, который source'ится в начале скрипта до выполнения любых операций. Конфиг SHALL определять переменные с дефолтами: `HOST`, `API_DIR`, `STATIC_DIR`, `SSH_OPTS`, `KEEP_RELEASES`, `NOTIFY`. Скрипт SHALL работать с дефолтными значениями, если конфиг-файл отсутствует.

Файл `deploy.conf` SHALL быть перечислен в `.gitignore` и не коммититься в репозиторий.

#### Scenario: Config file present and sourced

- **WHEN** `deploy/deploy.conf` существует
- **THEN** скрипт source'ит его перед любыми операциями
- **AND** переменные из конфига переопределяют дефолты

#### Scenario: Config file absent

- **WHEN** `deploy/deploy.conf` не существует
- **THEN** скрипт использует встроенные дефолты
- **AND** скрипт не падает с ошибкой

#### Scenario: Config file in .gitignore

- **WHEN** проверяется `.gitignore`
- **THEN** `deploy/deploy.conf` присутствует в списке игнорируемых файлов

### Requirement: Config parameters

Конфиг SHALL поддерживать следующие переменные:

| Переменная | Дефолт | Описание |
|---|---|---|
| `HOST` | `root@YOUR_VPS_IP` | SSH-таргет |
| `API_DIR` | `/opt/agent-music-tg` | Директория серверного кода на VPS |
| `STATIC_DIR` | `/srv/www/miniapp.xdshka.party` | Директория статики Mini App на VPS |
| `SSH_OPTS` | `-o ConnectTimeout=25 -o ConnectionAttempts=5 ...` | SSH флаги |
| `KEEP_RELEASES` | `5` | Сколько последних релизов хранить |
| `NOTIFY` | `true` | Включить Telegram-уведомления |

#### Scenario: Custom HOST in config

- **WHEN** в `deploy.conf` указан `HOST="user@staging.example.com"`
- **THEN** все ssh-команды идут на `user@staging.example.com`

#### Scenario: Custom KEEP_RELEASES

- **WHEN** в `deploy.conf` указан `KEEP_RELEASES=10`
- **THEN** после успешного деплоя удаляются все релизы, кроме 10 последних
