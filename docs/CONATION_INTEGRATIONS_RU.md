# Интеграции Conation: production-настройка

Этот документ описывает greenfield-развёртывание Conation на домене
`conation.dev`. Он перечисляет имена секретов, но **никогда не содержит их
значения**. Значения передаются процессам через операторское хранилище секретов
(например, Infisical Agent/CLI) или `APP_SECRETS_JSON`.

## Принятые публичные адреса

| Поверхность                   | Адрес                                        |
| ----------------------------- | -------------------------------------------- |
| Web и same-origin API         | `https://app.conation.dev`                   |
| FusionAuth                    | `https://auth.conation.dev`                  |
| MCP endpoint                  | `https://mcp.conation.dev/mcp`               |
| MCP OAuth callback            | `https://mcp.conation.dev/oauth/callback`    |
| Документация                  | `https://docs.conation.dev`                  |
| Статические onboarding-assets | `https://assets.conation.dev`                |
| Почта                         | `mail.conation.dev` / адреса `@conation.dev` |

Для authentication service значение `BASE_URL` должно быть
`https://app.conation.dev/auth`. Из него код строит callback:
`https://app.conation.dev/auth/oauth2/{provider}/callback`.

## Google OAuth и Gmail

Официальные инструкции Google:

- <https://developers.google.com/workspace/gmail/api/auth/web-server>
- <https://developers.google.com/workspace/gmail/api/guides/push>
- <https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification>

### 1. Создать проекты

1. Открыть <https://console.cloud.google.com/projectcreate>.
2. Создать раздельные проекты `conation-dev` и `conation-prod`.
3. В production-проекте открыть **APIs & Services → Library** и включить:
   **Gmail API**, **People API**, **Google Calendar API** (если календарь
   включён) и **Cloud Pub/Sub API**.
4. В Google Search Console подтвердить владение `conation.dev` тем же Google
   account, который является Owner/Editor Cloud-проекта.

### 2. Настроить Google Auth Platform

1. Открыть **Google Auth Platform → Branding**.
2. App name: `Conation`; User support email: `pythia@conation.dev`.
3. Home page: `https://conation.dev`; Privacy policy и Terms должны быть
   публичными страницами на `conation.dev`.
4. Authorized domain: `conation.dev`.
5. В **Audience** выбрать External для внешних Google-аккаунтов. До
   верификации оставить Testing и явно добавить тестовые аккаунты.
6. В **Data Access** добавить ровно scopes, которые запрашивает приложение:

   - `openid`, `profile`, `email`;
   - `https://www.googleapis.com/auth/gmail.modify`;
   - `https://www.googleapis.com/auth/gmail.settings.basic`;
   - `https://www.googleapis.com/auth/contacts.readonly`;
   - `https://www.googleapis.com/auth/contacts.other.readonly`;
   - calendar scope — только когда включён `CALENDAR_SCOPE_ENABLED`.

   Gmail scopes потребуют Google verification; для production следует заранее
   подготовить privacy disclosure, demo video и ответы о хранении/удалении
   Google user data.

### 3. Создать OAuth Web client

1. Открыть **Google Auth Platform → Clients → Create client**.
2. Application type: **Web application**; name: `Conation Production Web`.
3. Authorized JavaScript origin: `https://app.conation.dev`.
4. Authorized redirect URI:
   `https://app.conation.dev/auth/oauth2/google/callback`.
5. Сохранить Client ID как `GOOGLE_CLIENT_ID`, Client secret как
   `GOOGLE_CLIENT_SECRET_KEY` в secret store.
6. Эти же значения передаются генератору FusionAuth kickstart: identity
   provider `google_gmail` должен использовать тот же OAuth client.

### 4. Создать Gmail watch topic

1. Открыть **Pub/Sub → Topics → Create topic**.
2. Topic ID: `conation-gmail-watch-prod`; обычный Standard topic.
3. На вкладке Permissions добавить principal
   `gmail-api-push@system.gserviceaccount.com` с ролью **Pub/Sub Publisher**.
4. Значение `GMAIL_GCP_QUEUE`:
   `projects/<GOOGLE_PROJECT_ID>/topics/conation-gmail-watch-prod`.

Gmail публикует только notification/history ID. Содержимое писем всё равно
читается backend-ом по индивидуальному OAuth grant пользователя.

### 5. Создать pull subscription и service account

1. **Pub/Sub → Subscriptions → Create subscription**.
2. Subscription ID: `conation-gmail-forwarder-prod`.
3. Topic: `conation-gmail-watch-prod`; delivery type: **Pull**; включить retry
   policy и dead-letter policy по операторскому стандарту.
4. **IAM & Admin → Service Accounts → Create service account**:
   `conation-gmail-forwarder`.
5. На subscription выдать этому account только **Pub/Sub Subscriber**.
6. Код сейчас принимает JSON key. В service account открыть **Keys → Add key →
   Create new key → JSON**, один раз скачать файл и сохранить весь JSON как
   секрет `GMAIL_FORWARDER_SA_KEY`. Файл удалить с рабочей станции после
   загрузки. Долгосрочная цель — workload identity без user-managed key.
7. Forwarder получает subscription
   `projects/<GOOGLE_PROJECT_ID>/subscriptions/conation-gmail-forwarder-prod`
   и передаёт события во внутренний endpoint
   `http://email-service:8080/gmail/webhook` (не публиковать его напрямую).

### Можно ли отказаться от Gmail

На текущем состоянии исходников — **нет, если нужен встроенный полноценный
почтовый ящик**. Транзакционные письма (одноразовые коды, подтверждение адреса)
уже могут уходить через SMTP и локально попадают в Mailpit, но чтение папок,
поиск, черновики, отправка, history cursor и push-синхронизация пользовательской
почты всё ещё реализованы через Gmail API.

Экспериментальный Stalwart-контейнер и `StalwartProvider` пока не заменяют этот
путь. В изолированном adapter уже реализованы JMAP session discovery,
`Email/query`, `Email/get` и отправка MIME через upload/import/submission; они
проверяются контрактными тестами с WireMock, а не работающим Stalwart-сервером.
Этот adapter не включён в composition root `email_service`. Для него пока нет
signup-provisioning пользовательских ящиков, JMAP push/watch, cursor recovery,
initial/incremental backfill, UI-integration или end-to-end проверки. Mailpit
остаётся локальным SMTP sink для системных писем, а не inbox. Поэтому допустимы
только два честных production-профиля:

1. `gmail`: включить OAuth/Pub/Sub по шагам выше и получить работающий inbox;
2. `no-inbox`: не показывать пользователю встроенную почту, оставить SMTP для
   системных писем и явно пометить inbox как отключённый.

Профиль `stalwart` станет поддерживаемым после подключения существующего adapter
к runtime `email_service`, реализации защищённого signup-provisioning, cursor
recovery, push/event delivery, backfill и UI-потока, а также end-to-end теста
«создать пользователя → получить письмо → ответить → увидеть ответ в
Conation». До прохождения этого теста Gmail — единственный runtime backend
нынешнего Conation Inbox; без Gmail встроенная почта не работает.

## GitHub login и Conation Tasks

Официальные инструкции:

- <https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app>
- <https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app>
- <https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/using-webhooks-with-github-apps>

### OAuth App для входа/связки аккаунта

1. GitHub → avatar → **Settings → Developer settings → OAuth Apps → New OAuth
   App**.
2. Name: `Conation`; Homepage: `https://conation.dev`.
3. Authorization callback URL:
   `https://app.conation.dev/auth/oauth2/github/callback`.
4. Сохранить Client ID как `GITHUB_CLIENT_ID`, сгенерировать Client secret и
   сохранить как `GITHUB_CLIENT_SECRET`.
5. После создания GitHub identity provider в FusionAuth сохранить его ID как
   `GITHUB_IDP_ID`.

### GitHub App для задач, PR и coding agent

1. GitHub → **Settings → Developer settings → GitHub Apps → New GitHub App**.
2. Name: `Conation Tasks`; Homepage: `https://conation.dev`.
3. Setup URL:
   `https://app.conation.dev/dss/github/sync-redirect`; включить запрос user
   authorization при установке.
4. Webhook URL: `https://app.conation.dev/dss/github/webhook`; SSL verification
   включена. Создать случайный webhook secret.
5. Repository permissions:
   - Metadata: Read;
   - Contents: Read & write (нужно coding agent для git операций);
   - Pull requests: Read & write;
   - Issues: Read & write (PR comments используют Issues API);
   - Checks: Read.
6. Events: `Pull request`, `Pull request review`, `Pull request review comment`,
   `Issue comment`, `Check run`, `Installation`.
7. Для одного собственного deployment выбрать **Only on this account**; для
   установки клиентами — **Any account** после security review.
8. После создания записать:
   - installation page (`https://github.com/apps/<slug>`) →
     `GITHUB_SYNC_APP_URL`;
   - Client ID → `GITHUB_SYNC_APP_CLIENT_ID`;
   - Client secret → `GITHUB_SYNC_APP_CLIENT_SECRET`;
   - webhook secret → `GITHUB_WEBHOOK_SECRET_KEY`;
   - отдельную случайную 32+ byte строку →
     `GITHUB_INSTALLATION_STATE_SECRET`;
   - сгенерированный private key PEM целиком →
     `GITHUB_SYNC_APP_PEM_SECRET_KEY`.

Реализованный task-status contract: draft PR → `In Progress`, ready/open
PR → `In Review`, merged PR → `Completed`, closed-unmerged PR → `Not Started`.
Обработчик принимает отдельные GitHub actions `ready_for_review` и
`converted_to_draft`; контракт защищён domain- и webhook-тестами. Публичный
task-reference namespace — `CONATION-<short_uuid>`: префикс распознаётся без
учёта регистра, а устаревший `MACRO-…` намеренно не принимается в greenfield-
профиле. В базе по-прежнему хранится только `short_uuid`, поэтому эта смена
публичного представления не требует SQL-миграции и не меняет GitHub payload.

## Sandbox / coding agent

Есть два режима:

1. Local evaluation — Docker provider; секрет не нужен, но процесс получает
   доступ к Docker socket и разрешён только при `ENVIRONMENT=local`.
2. Production isolation — Daytona. Нужны:
   - `DAYTONA_API_URL` (по умолчанию `https://app.daytona.io/api`);
   - `DAYTONA_API_KEY`;
   - заранее собранный snapshot и его имя в `DAYTONA_SNAPSHOT`;
   - Conation-owned `HARNESS_REPO_URL` / `CURSOR_REPO_URL` либо выбор repo в
     request вместо одного глобального URL;
   - GitHub App credentials из предыдущего раздела;
   - публичный TLS `EGRESS_BASE_URL`, доступный sandbox-ам;
   - `CONATION_MCP_URL` с адресом MCP endpoint Conation.

`agent_harness` публикует для sandbox только capability-защищенный маршрут
`POST /openai/v1/chat/completions`. Сессия передаёт непрозрачную capability, а
сервер подставляет свой `ROX_API_KEY`; в образ, переменные окружения sandbox и
OpenCode этот ключ не попадает. Маршрут фиксирует операцию, а не является
общим HTTP-прокси. Внутренний loopback-sidecar выполняет упорядоченное
переключение до получения заголовков ответа: Gemini Flash → Nematron → Luna.

Standalone `coding-agent-worker` использует отдельный публичный маршрут
`POST /conation-model-proxy/v1/chat/completions`. Для каждой sandbox-сессии он
выдаёт краткоживущую capability и отзывает её при завершении сессии; worker
сам хранит серверный `ROX_API_KEY`. Здесь также нет инъекции ключа OmniRoute в
sandbox. Его loopback-sidecar применяет ту же последовательность моделей до
начала ответа.

### Границы реализаций и готовность к эксплуатации

Это три разные реализации, а не взаимозаменяемые варианты одного production
сервиса.

1. `agent_harness_service` — официальная часть локального/self-host stack.
   Он умеет создавать управляемый Docker sandbox в local-режиме и Daytona
   sandbox при соответствующей конфигурации. Доступ к моделям идёт через
   ограниченный server-side egress: sandbox получает capability, а не
   `ROX_API_KEY`.
2. Rust `conationd` — доверенный daemon оператора, а не контейнер текущего
   self-host stack. Совместное размещение OpenCode с его bot/webhook
   конфигурацией в одном процессе или слабо изолированном окружении раскроет
   операторские секреты. До более сильной изоляции процесса и секретов его
   нельзя выдавать за безопасный self-host coding runtime.
3. TypeScript `coding-agent-worker` — самостоятельный Daytona/cloud worker.
   Для него пока нет воспроизводимого self-host image, маршрутизации хоста и
   подтверждённого сценария развёртывания. Кроме того, его GitHub credential
   всё ещё доступен процессам sandbox; model capability этого не исправляет.

Следующая безопасная работа: выделить для GitHub внутренний scoped egress grant
или API proxy; изолировать секреты и процессы от кода/инструментов sandbox;
настроить публичные TLS endpoints и callbacks; после этого выполнить реальный
smoke-тест каждой границы. До выполнения этих шагов документация не заявляет
готовность ни одного cloud/Daytona маршрута к production.

## Публичный MCP и OAuth/JWT

1. DNS: `mcp.conation.dev` направить на публичный ingress/Caddy.
2. TLS: выпустить сертификат, разрешить только `443`; backend MCP не публиковать
   отдельным портом.
3. Reverse proxy должен без переписывания semantics обслуживать endpoint
   `/mcp`, OAuth callback `/oauth/callback` и OAuth metadata `/.well-known/*`.
4. Передать MCP service:
   - `MCP_PUBLIC_URL=https://mcp.conation.dev`;
   - `APP_BASE_URL=https://app.conation.dev`;
   - `FUSIONAUTH_PUBLIC_URL=https://auth.conation.dev`;
   - внутренние `FUSIONAUTH_BASE_URL`, `FUSIONAUTH_CLIENT_ID`, API/client
     secrets;
   - `REDIS_URL` для временного OAuth state;
   - `DOCUMENT_PERMISSION_JWT` и валидатор FusionAuth JWT;
   - `INTERNAL_API_KEY` и service-to-service keys.
5. В FusionAuth зарегистрировать callback
   `https://mcp.conation.dev/oauth/callback` у MCP application/client.
6. JWT issuer, audience, JWKS и clock skew должны быть согласованы между
   FusionAuth, MCP и resource services. Не использовать один signing key для
   FusionAuth access tokens, document permission JWT и internal API tokens.
7. Smoke:
   - metadata endpoints доступны без login;
   - `/mcp` без token возвращает OAuth challenge;
   - authorization-code + PKCE возвращает token;
   - token другого audience отклоняется;
   - валидный пользователь видит только доступные ему entities.

## OmniRoute / Rox

Conation использует OpenAI-compatible base URL `https://api.rox.one/v1`.
Секрет хранится только на сервере как `ROX_API_KEY`; его нельзя встраивать во
frontend, container image или репозиторий. На 2026-09-01 authenticated
`GET /v1/models` и минимальный completion подтвердили точные идентификаторы и
работоспособность всех трех моделей:

1. `gemini-2.5-flash` — primary;
2. `nemotron-3-ultra` — первый fallback;
3. `gpt-5.6-luna` — последний fallback.

Основной backend assistant хранит provider-qualified цепочку
`rox/gemini-2.5-flash,rox/nemotron-3-ultra,rox/gpt-5.6-luna`. Ее можно целиком
переопределить серверной переменной `ROX_MODEL_FALLBACK_CHAIN`. Его policy
классифицируется по typed error/status: `408/409/425/429/5xx` получают один
retry той же модели, затем fallback; `404/422` сразу переходят к следующей;
`400/401/403`, отмена и локальная ошибка конфигурации останавливают запрос.
После первого отданного stream item модель не меняется, чтобы не смешивать два
ответа в одном сообщении. Фактически обслужившая модель записывается в usage.

Управляющий OmniRoute API выдает ключ через authenticated loopback flow:
`POST /users` (нужен verified numeric Telegram identity), затем
`POST /users/:userId/keys`; plaintext возвращается ровно один раз. Внутренний
`KeyService` поддерживает idempotency key, но текущий HTTP route его не
принимает. Поэтому автоматический выпуск Conation service key пока запрещен:
сначала нужно добавить и протестировать передачу `idempotencyKey` в HTTP route,
затем одной операцией записать одноразовый plaintext в Infisical как
`ROX_API_KEY`. Не выводить его в terminal log или CI output.

Provisioned coding sandbox — отдельный OpenCode runtime. Он получает локальный
адрес sidecar и session capability, но **не** `ROX_API_KEY`. OpenCode не умеет
декларативно задавать упорядоченный межмодельный fallback; это делает sidecar,
который передаёт capability в один из ограниченных серверных маршрутов выше.
Он переключает Gemini Flash → Nematron → Luna лишь при ошибке до заголовков
upstream-ответа. После начала stream ответ не повторяется, чтобы не смешивать
два сообщения.

Это реализованный контракт исходников, но не заявление о готовом production
сервисе OmniRoute. Перед вводом в эксплуатацию нужны: серверная настройка
`ROX_API_KEY`; публичный HTTPS URL соответствующего egress/worker, достижимый
из Daytona; и реальный smoke-тест создания сессии и completion через каждую
проверяемую границу. До этого нельзя утверждать, что live fallback подтверждён.

При сборке sandbox image приватный `https://github.com/agisota/conation.git`
может прогреть Nix dev shell. `GH_TOKEN`/`GITHUB_TOKEN` передается BuildKit как
secret `github_token`, читается одноразовым `GIT_ASKPASS` и не попадает в build
ARG, URL или слой. Daytona CLI для прямой сборки Dockerfile не принимает
BuildKit secret; такой builder создает корректный «холодный» snapshot, а repo
клонируется при запуске через существующий egress credential flow. Live bake и
первый model prompt проверяются только после выдачи ротированного token/key; в
репозитории и CI logs значения секретов не фиксируются.
