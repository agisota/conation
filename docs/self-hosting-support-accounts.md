# Учётные записи поддержки Conation

Conation создаёт приватный канал поддержки для каждого нового пользователя. В
канале участвуют реальные учётные записи, а не текстовые заглушки:

| Адрес | Профиль | Роль |
| --- | --- | --- |
| `pythia@conation.dev` | Пифия | автор приветствия и служба поддержки |
| `tars@conation.dev` | Тарс | технический директор |
| `ramzan.kadyrov@conation.dev` | Рамзан Кадыров | генеральный директор |

Канонические идентификаторы приложения имеют вид
`conation|<email>`. Greenfield-сборка не принимает `macro|` как псевдоним.

## Локальный стек

`just run_local --no-doppler` дожидается готовности authentication-service и
идемпотентно согласует все три профиля в локальном FusionAuth. При первом
создании обычный webhook создаёт соответствующую запись пользователя в БД,
имя и локальный URL аватара. Самим служебным пользователям starter-документы и
персональные support-каналы не создаются.

Войти под каждым адресом можно стандартным passwordless-входом. В локальном
режиме код находится в Mailpit. После входа аккаунт может отвечать в канале как
любой другой пользователь.

## Read-only preflight для оператора

Перед открытием self-host стека для пользователей выполните проверку без
мутаций:

```bash
bash tooling/scripts/preflight-conation-support-accounts.sh --static
```

`--static` не требует секретов или сети: он проверяет фиксированный manifest
трёх Conation identities и локальные SVG-аватары. Результат `PASS` в этом режиме
говорит только о состоянии файлов в репозитории, а не о запущенном FusionAuth или БД.

Когда FusionAuth и authentication-service уже доступны, ключ FusionAuth должен
попасть в окружение из secret manager или защищённого env-файла, а не из shell
history. Затем выполните online-проверку:

```bash
# FUSIONAUTH_API_KEY уже передан безопасным способом в окружение процесса.
FUSIONAUTH_URL="https://auth.conation.dev" \
FUSIONAUTH_APPLICATION_ID="<UUID приложения Conation>" \
CONATION_SUPPORT_AVATAR_BASE_URL="https://app.conation.dev" \
CONATION_AUTH_HEALTH_URL="https://app.conation.dev/auth/health" \
bash tooling/scripts/preflight-conation-support-accounts.sh --online
```

`--online` делает только `GET`-запросы. Он сверяет application и её tenant,
транзакционные события `user.create`/`user.create.complete`, endpoint webhook
`/webhooks/user`, наличие заголовка внутренней авторизации, все три профиля и
их registrations. Он также проверяет health authentication-service. Он не
создаёт и не обновляет FusionAuth users, registrations, каналы или сообщения.

Если оператор безопасно передаст в окружение
`CONATION_SUPPORT_PREFLIGHT_WEBHOOK_KEY`, проверка дополнительно сравнит это
значение с `x-internal-auth-key` webhook, не выводя значение. Без этой переменной
результат честно содержит `NOT VERIFIED`: наличие непустого заголовка доказано,
но его равенство секрету authentication-service — нет.

Онлайн-успех всё ещё не доказывает, что webhook когда-либо выполнился. Для
runtime-доказательства сначала завершите signup **нового обычного** тестового
пользователя и дождитесь фонового создания его канала. Затем используйте
отдельную read-only PostgreSQL роль. Передайте libpq service name, а не URL с
паролем:

```ini
# Файл PGSERVICEFILE с правами 0600; пароль хранится отдельно, например в .pgpass
# с правами 0600 или в клиентском сертификате.
[conation-support-readonly]
host=<postgres-host>
port=5432
dbname=macrodb
user=conation_support_audit
sslmode=require
```

Этой роли достаточно `USAGE` на schema `public` и `SELECT` только на таблицы
`"User"`, `comms_channels`, `comms_channel_participants` и `comms_messages`.
После того как необходимые FusionAuth-переменные из предыдущего шага всё ещё
находятся в окружении, запустите:

```bash
PGSERVICEFILE="/secure/path/pg_service.conf" \
CONATION_SUPPORT_PREFLIGHT_PG_SERVICE="conation-support-readonly" \
CONATION_SUPPORT_PREFLIGHT_PROBE_EMAIL="new.user@your-domain.example" \
bash tooling/scripts/preflight-conation-support-accounts.sh --runtime
```

`--runtime` повторяет online-проверку и запускает единственный SQL-сеанс с
`BEGIN READ ONLY`. Он подтверждает профиль probe-пользователя, три профиля
поддержки, private channel с активным membership всех четырёх участников и
приветствие Пифии. Он не создаёт probe-пользователя и не пытается исправлять
отсутствующие записи. Если канал ещё не появился, это не повод обходить ошибку:
дождитесь завершения background-задачи и повторите проверку.

Даже runtime `PASS` не является обещанием «учётные записи точно могут отвечать
из любого ingress»: он не выполняет login от имени Пифии и не отправляет
сообщение. Поле `canReply` в FusionAuth проверяется как metadata профиля, но
само по себе не выдаёт доступ к каналам; доступ подтверждается активным
membership.

## Повторный запуск или отдельный self-host

После запуска FusionAuth и authentication-service выполните:

```bash
FUSIONAUTH_URL="https://auth.conation.dev" \
FUSIONAUTH_API_KEY="<установить локально, не вставлять в командную историю>" \
FUSIONAUTH_APPLICATION_ID="<UUID приложения Conation>" \
CONATION_SUPPORT_AVATAR_BASE_URL="https://app.conation.dev" \
CONATION_AUTH_HEALTH_URL="https://app.conation.dev/auth/health" \
bash tooling/scripts/provision-conation-support-users.sh
```

Эта команда создаёт или обновляет только три учётные записи и регистрации
приложения в FusionAuth: email, имя, роль, аватар и metadata профиля. Успешное
завершение команды само по себе не подтверждает наличие профиля в БД Conation,
канала поддержки или права на ответ. Поле `canReply` в metadata FusionAuth не
выдаёт доступ к каналам.

Чтобы новый обычный пользователь получил личный канал поддержки, в FusionAuth
должен быть включён и направлен в authentication-service транзакционный
webhook `user.create`. Именно backend после такого создания создаёт приватный
канал, добавляет в него нового пользователя и все три учётные записи поддержки
и публикует приветствие от Пифии. Активное членство в этом канале, а не
FusionAuth metadata, позволяет Пифии, Тарсу и Рамзану отвечать через обычный
интерфейс Conation.

Перед запуском на отдельном self-host выполните описанный выше read-only
preflight: режим `--online` проверяет endpoint, события `user.create`, webhook
и профили FusionAuth, а `--runtime` дополнительно проверяет профиль в БД и
созданные memberships. Проверка не создаёт каналы задним числом для
пользователей, уже существовавших до включения этой функции.

В production лучше передавать секрет через secret manager или временный env-файл
с правами `0600`, а не записывать значение прямо в shell history. Скрипт не
показывает API key и не передаёт его через argv. Повторный запуск обновляет
профили и не создаёт дубликаты.

Если email уже занят FusionAuth-пользователем с другим UUID, скрипт
останавливается до любых изменений. Это защита от захвата чужого аккаунта:
сначала вручную проверьте и разрешите миграцию, а не подменяйте профиль
повторным запуском.

Чтобы passwordless-вход работал вне локального Mailpit, оператор обязан создать
или маршрутизировать три почтовых ящика `@conation.dev` в своём почтовом
контуре. Провижининг FusionAuth сам по себе не создаёт SMTP/IMAP-ящики.

Для закреплённого Stalwart v0.16 эти ящики создаются отдельной операторской
командой после завершения bootstrap:

```bash
nix develop --command just selfhost-provision-support-mailboxes
```

Она использует JMAP management CLI, не меняет пароли уже существующих ящиков и
не запускается автоматически при старте Compose. Необходимые переменные,
ограничения профиля и доказательный аудит встроенного inbox описаны в
`docs/SELF_HOST_STALWART_MAILBOX_AUDIT_RU.md`. Signup-ящик Stalwart появляется
во встроенном inbox как `UserProvider::Stalwart`. Gmail — необязательная
интеграция, не условие работы почты. Публичная internet-доставляемость
(MX/DKIM) этим рецептом не заявлена; см. `docs/CONATION_INTEGRATIONS_RU.md`.

Аватары принадлежат репозиторию и раздаются web-приложением из
`apps/web/public/support-avatars/`; внешнего CDN Macro нет.
