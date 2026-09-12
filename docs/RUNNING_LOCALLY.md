# Локальный запуск Conation

Этот документ описывает три разные задачи:

1. собрать web-клиент из исходников;
2. запустить полный локальный контур разработки;
3. получить standalone web/Tauri-артефакт для собственного backend-origin.

Локальный контур подходит для разработки, проверки и демонстрации. Он не
является готовым публичным production-развёртыванием. Актуальная карта AWS-
зависимостей, ingress и неподдержанных production-возможностей находится в
[статусе self-hosting](../infra/selfhost/README.md).

## Что получится в браузере и desktop

Основной интерфейс — SolidJS/Vite SPA. При локальном запуске он доступен по
адресу `http://localhost:3000/app`. Та же сборка используется внутри Tauri на
desktop и mobile, поэтому web-режим не является урезанной копией desktop.

Различаются не функции интерфейса, а окружение:

- браузер получает API через HTTP/WebSocket;
- Tauri добавляет нативные возможности и ограничения capability-файлов;
- внешний production требует TLS, ingress, секреты, резервное копирование и
  эксплуатационные процедуры, которых локальный запуск не создаёт.

## Предварительные требования

Нужен [Nix](https://nix.dev/install-nix). Закрытый репозиторий клонируется при
наличии GitHub-доступа:

```bash
git clone https://github.com/agisota/conation.git
\cd conation
nix develop
```

Если flakes ещё не включены:

```bash
nix develop \
  --extra-experimental-features nix-command \
  --extra-experimental-features flakes
```

Для постоянной настройки добавьте в `~/.config/nix/nix.conf`:

```text
experimental-features = nix-command flakes
```

Nix shell предоставляет Rust, Cargo, Bun, `just`, SQLx CLI, Zig и общие
инструменты сборки.

### Дополнительно на macOS

Установите Docker runtime: Docker Desktop, OrbStack или Colima. Nix
предоставляет Docker CLI, но не запускает macOS VM/daemon вместо runtime.

Для desktop/iOS-сборок нужен Xcode с Command Line Tools. Наличие Xcode не
заменяет Apple Developer certificate, подпись и notarization.

## Только собрать web-клиент

Установите workspace-зависимости из корня:

```bash
bun install
\cd apps/web
bunx vite build -c vite.config.ts
```

Готовый SPA будет в `apps/web/dist`. Эта команда подтверждает компиляцию, но не
поднимает API. Без backend страница не сможет выполнить вход, загрузить
документы или синхронизировать данные.

Репозиторный production-рецепт дополнительно собирает нужные WASM-компоненты и
пишет метаданные артефакта:

```bash
\cd apps/web
just build-prod
just check-standalone-artifact
```

Проверка `check-standalone-artifact` ищет в собранном standalone-клиенте
запрещённые managed Macro endpoints и legacy URL scheme. Это статический gate,
а не end-to-end тест backend.

## Полный локальный стек на macOS/Linux

Перед первым запуском проверьте инструменты, Docker daemon и порты:

```bash
just doctor-local
```

Запуск без внутренних Doppler-секретов:

```bash
just run_local --no-doppler
```

Стек использует локальные/тестовые значения и поднимает Postgres с pgvector,
Redis, OpenSearch, Kafka, FusionAuth, LocalStack, Mailpit, application services,
proxy и Vite. По окончании запуска откройте:

- приложение — `http://localhost:3000/app`;
- backend proxy — `http://localhost:8090`;
- FusionAuth — `http://localhost:9011`;
- Mailpit — `http://localhost:8025`;
- LocalStack — `http://localhost:4566`.

`--no-doppler` означает, что внешние интеграции получают безопасные stubs.
Локальный вход по одноразовому коду работает, но Google/Gmail, GitHub, реальные
AI-провайдеры и Internet mail delivery без credentials не заработают.

Пока интерактивный `run_local` работает:

- `r` пересобирает изменённые Rust services;
- `q` корректно останавливает стек.

Если изменялись `sync_service`, `lexical_service` или `websocket_service`,
запустите контур с пересборкой их Docker-образов:

```bash
just run_local --no-doppler --build-aux-services
```

## Вход и тестовые данные

Предварительно создавать пользователя не нужно. Введите любой тестовый email в
passwordless login. Authentication service создаст пользователя, а письмо с
кодом попадёт в Mailpit по адресу `http://localhost:8025`.

Mailpit — только локальный SMTP sink/UI. Он не создаёт рабочий почтовый ящик
пользователя и не доказывает замену Gmail на Stalwart.

Для демонстрационных документов, каналов, задач и ролей:

```bash
just seed-scenario apply --file seed/scenarios/team-perms.json
```

Полезные безопасные команды:

```bash
just seed-scenario status --file seed/scenarios/team-perms.json
just seed-scenario matrix --file seed/scenarios/team-perms.json
```

`reset` сценария удаляет созданные им строки и аккаунты. Не запускайте reset,
если эти данные нужно сохранить.

## Cursor Cloud

В подготовленном Cursor Cloud используйте только поддерживаемые entrypoints:

```bash
bash .cursor/infra.sh
bash .cursor/stack.sh
```

`infra.sh` поднимает Docker, Postgres и Redis для DB-backed тестов. `stack.sh`
оставляет здоровый backend на месте и запускает hot-reload frontend. Не
передавайте `--fresh`, если не хотите намеренно пересоздать локальные данные.

После изменений Rust-backend:

```bash
bash .cursor/rebuild.sh
```

Frontend-изменения применяются Vite автоматически.

## Headless-режим

Для CI/агентов можно поднять статически собранный frontend и backend без
интерактивной петли:

```bash
just stack up --no-doppler
just stack status --json
```

Обновление без сброса volumes:

```bash
just stack update
just stack update --frontend
```

Остановка с сохранением данных:

```bash
just stack down --keep-data
```

Приложение в headless-контуре отдаётся через единый proxy origin по пути
`/app/`.

После готовности `/auth/health` команда `stack up` идемпотентно согласует в
FusionAuth три служебных профиля Conation — так же, как `run_local`. Для
именованного экземпляра используются только его вычисленные порты; другие
Compose projects и их данные provisioning не перезапускает и не пересоздаёт:

```bash
just stack up --no-doppler --instance agent-a
```

В headless-профилях URL аватаров указывает на тот же proxy origin, который
раздаёт `/app/`; незапущенный Vite-порт в профили не записывается.

## Несколько изолированных экземпляров

Для параллельных worktree используйте имя instance:

```bash
just run_local --no-doppler --instance agent-a
just run_local --no-doppler --instance agent-b
```

Если стандартные порты заняты, сначала проверьте новое окно:

```bash
just doctor-local --instance test --port-base 31000
just run_local --no-doppler --instance test --port-base 31000
```

Одинаковые `--instance` и `--port-base` нужно передавать в `run_local`, status и
seed-команды: иначе инструмент обратится к другому стеку.

На macOS часто конфликтуют порт 8080 (WebDriver) и 8090 (другой dev server).
Менять системные службы необязательно — выберите свободный `--port-base`.

## Внешние интеграции и секреты

Передавайте секреты через локальный игнорируемый env-файл или секрет-хранилище,
никогда не коммитьте их и не вставляйте в документацию:

```bash
just run_local --no-doppler --env-file ./local.env
```

Основные опциональные интеграции:

| Интеграция                    | Что требуется                                               | Поведение без секрета                                                       |
| ----------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| Google OAuth / Gmail          | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET_KEY`              | Google login и Gmail sync недоступны; локальный passwordless login работает |
| GitHub                        | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_IDP_ID` | GitHub login/tasks недоступны                                               |
| AI через операторский gateway | ключ и endpoint, соответствующие выбранному adapter         | Agent service может быть unhealthy либо функция завершится явной ошибкой    |
| CloudFront-совместимые URL    | signer/distribution settings                                | Локальное S3 скачивание может обходиться без CloudFront, production — нет   |
| Публичная почта               | SMTP/JMAP/provider credentials, DNS/MX/SPF/DKIM/DMARC       | Письма остаются в Mailpit; пользовательский inbox не появляется             |

Внутренний URL базы данных задаётся через `CONATION_DB_URL`. Для полностью
чистого развёртывания не оставляйте прежний ключ как alias: обновите секрет во
всех deployment-конфигурациях одновременно.

## Standalone

`standalone` — профиль адресации клиента. В production web-сборке он по
умолчанию использует same-origin маршруты. Оператор должен направить их в
соответствующие Conation services; точный ingress-контракт перечислен в
[self-hosting status](../infra/selfhost/README.md).

Фиксированный операторский origin задаётся на этапе сборки:

```bash
\cd apps/web
VITE_CONATION_OPERATOR_ORIGIN=https://conation.example just build-prod
```

Для Tauri:

```bash
\cd apps/web
CONATION_OPERATOR_ORIGIN=https://conation.example just tauri-build-standalone
```

Чтобы native-сборка ходила в локальный стек на этой машине (прокси
`just stack` / `just run_local` на порту **8090**), а не в публичный
`https://conation.dev`, используйте рецепт, который требует явный origin:

```bash
\cd apps/web
CONATION_OPERATOR_ORIGIN=http://<this-host>:8090 just tauri-build-local-stack
```

`<this-host>` — адрес, с которого клиент достигает этот сервер. Рецепт
отклоняет пустой origin, `same-origin` и hosted `conation.dev`.

В обоих примерах `conation.example` нужно заменить на реально контролируемый
HTTPS origin. Сборка отклоняет managed Macro hosts в standalone-профиле.

Conation поддерживает только standalone-профиль. Старое значение
`VITE_CONATION_CLIENT_PROFILE=hosted-legacy` отклоняется до сборки, чтобы
артефакт не мог получить managed Macro endpoints или app links.

## Что ещё не подтверждено для production

- публичный TLS/ingress, WAF/rate limits и multi-node topology;
- полный backup/restore для Postgres, object storage, FusionAuth, Kafka и search;
- замена всех SQS/DynamoDB/KMS/Lambda/ECS/SES/SNS контрактов;
- полноценные почтовые аккаунты Stalwart и Internet delivery;
- locale пользователя в асинхронных email/push/digest;
- production egress для sandbox, его TLS-достижимость из Daytona и live
  OmniRoute smoke-тест; исходники содержат capability-защищенный fallback,
  но end-to-end production-подтверждения ещё нет;
- подписанный и notarized macOS artifact;
- проверенные public web/docs/MCP endpoints на домене `conation.dev`.

До закрытия этих пунктов корректное описание — «локально собирается и
запускается для разработки/валидации», а не «готово к production deployment».
