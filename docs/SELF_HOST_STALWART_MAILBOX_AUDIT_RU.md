# Ящики поддержки Stalwart и встроенный inbox Conation

Статус этого документа: проверенный контур провиженирования для закреплённого
Stalwart `v0.16` и честная граница текущей интеграции. Создание почтового ящика
не означает, что он автоматически появился во встроенном inbox Conation.

## Что реализовано

Manifest `infra/selfhost/stalwart/support-mailboxes.json` фиксирует домен
`conation.dev` и три ящика:

| Адрес | Описание в Stalwart | Локаль | Системная роль |
| --- | --- | --- | --- |
| `pythia@conation.dev` | `Пифия — служба поддержки Conation` | `ru-RU` | `User` |
| `tars@conation.dev` | `Тарс — технический директор Conation` | `ru-RU` | `User` |
| `ramzan.kadyrov@conation.dev` | `Рамзан Кадыров — генеральный директор Conation` | `ru-RU` | `User` |

`description` — единственное подходящее поле профиля в объекте Stalwart
`Account/User`. Должности из таблицы не являются административными ролями
почтового сервера. Всем трём аккаунтам намеренно назначается роль `User`.
Персонального avatar-поля в этой схеме нет; аватары и полные продуктовые
профили остаются в FusionAuth/Conation.

Серверный image закреплён как
`stalwartlabs/stalwart:v0.16@sha256:74ca4f7f6885fe302f38a99381f36a208547afce1033d8734d9e6d8d3eba7446`.
В нём нет `stalwart-cli`: начиная с v0.16 CLI выпускается отдельно. Operator
action использует официальный multi-arch image
`ghcr.io/stalwartlabs/cli:1.0.10@sha256:8d8357e347094d1ee9e2bd3dbdf4f0b4fca6786c5207dc112db29b7456aa5586`.
Он работает через JMAP management API, а не через удалённый REST
`/api/principal`.

Официальные контракты, по которым проверен этот срез:

- [Stalwart v0.16 upgrade](https://github.com/stalwartlabs/stalwart/blob/main/UPGRADING/v0_16.md);
- [CLI overview](https://stalw.art/docs/management/cli/);
- [Domain object](https://stalw.art/docs/ref/object/domain/);
- [Account/User object](https://stalw.art/docs/ref/object/account/);
- [bootstrap mode](https://stalw.art/docs/configuration/bootstrap-mode/).

## Безопасный запуск оператором

Сначала завершите первоначальный Stalwart bootstrap в `/admin`. Пока сервер в
bootstrap mode, он разрешает только объект `Bootstrap`, поэтому команда ниже
завершится с понятной ошибкой и ничего не создаст.

Передайте либо короткоживущий административный API token:

```bash
export STALWART_URL=http://host.docker.internal:18081
export STALWART_TOKEN
export CONATION_STALWART_PYTHIA_PASSWORD
export CONATION_STALWART_TARS_PASSWORD
export CONATION_STALWART_RAMZAN_KADYROV_PASSWORD
nix develop --command just selfhost-provision-support-mailboxes
```

либо `STALWART_USER` и `STALWART_PASSWORD`. Не задавайте token и пароль
одновременно. Значения должны поступать из операторского secret store или из
интерактивного `read -s`; не записывайте их в командную строку, `.env` под Git
или историю shell. `host.docker.internal` нужен закреплённому CLI-контейнеру;
при использовании локального бинарника через `CONATION_STALWART_CLI` задайте
доступный ему URL, например `http://127.0.0.1:18081`.

Команда сначала читает состояние и проверяет весь план. Для отсутствующего
ящика обязателен соответствующий password env. Только после проверки всех
нужных паролей она создаёт отсутствующий домен/аккаунты. Повторный запуск:

- не удаляет объекты;
- не создаёт дубликаты;
- не меняет пароль существующего аккаунта;
- согласует только русское `description`, `locale=ru-RU` и роль `User`;
- инвалидирует cache после фактического создания аккаунтов.

Проверка без обращения к серверу:

```bash
nix develop --command just selfhost-test-support-mailboxes
```

Fake-CLI harness покрывает первый create, повторный запуск, отсутствующий
пароль до первой account-записи и отсутствие secret-значений в выводе/логах.

## Почему это пока не заменяет Gmail во встроенном inbox

Аудит composition root и provider paths показывает:

1. `crates/email/src/domain/models/link.rs` содержит единственный вариант
   `UserProvider::Gmail`.
2. `services/email_service/src/main.rs` всегда создаёт
   `GmailApiClientRepository`, Gmail token provider и очереди `gmail_*`.
3. `services/email_service/src/api/email/init.rs` создаёт только Gmail link и
   требует завершённый Google OAuth grant/history cursor.
4. Входящие изменения приходят через Google Pub/Sub webhook и Gmail history;
   отправка/reply идёт через Gmail API.
5. `crates/email_provider` не включён в composition root `email_service`.
   Его transport adapter уже умеет JMAP session discovery, `Email/query`,
   `Email/get` и стандартную отправку MIME через `Mailbox/get` (роль Drafts) →
   upload → `Email/import` → `Identity/get` → `EmailSubmission/set`. Bearer-
   запросы к URL из session document разрешены только на настроенный Stalwart
   origin. Результат пока не вызывается встроенным inbox; JMAP push/watches
   остаются явно `Unsupported`.

Следствие: после провиженирования этими ящиками можно пользоваться через
поддерживаемый Stalwart JMAP/IMAP/SMTP-клиент после полноценной настройки
сервера. Они **не отображаются** во встроенном inbox Conation и не могут из
него отвечать. Gmail можно не подключать, если нужен только внутренний канал
поддержки Conation или внешний отдельный mail client. Для существующей функции
Conation Inbox Gmail пока обязателен: добавленный JMAP transport adapter сам по
себе не создаёт link, не хранит cursor/token и не подключён к runtime service.

Чтобы убрать Gmail именно из встроенного inbox, нужен отдельный production
slice: вариант `UserProvider::Stalwart`, JMAP session/auth adapter, Email/query
и Email/get, initial/incremental sync cursor, push/event delivery, labels,
attachments, contacts, EmailSubmission/reply, token storage/rotation,
backfill/retry semantics и end-to-end тесты. SMTP transport для
транзакционных писем не заменяет этот JMAP adapter.

## Что остаётся оператору для реальной Internet-почты

До заявления о production-доставляемости необходимо:

1. завершить bootstrap и создать постоянного администратора или
   least-privilege API token; recovery credential после аварийной операции
   убрать из production environment;
2. выпустить доверенный TLS certificate для `mail.conation.dev`, открыть
   необходимые входящие SMTP и клиентские JMAP/IMAP/submission endpoints;
3. направить `A`/`AAAA` для `mail.conation.dev` и `MX` домена `conation.dev`;
4. опубликовать SPF, сгенерированные Stalwart DKIM records и DMARC, затем
   проверить их фактическое выравнивание;
5. настроить PTR/reverse DNS на `mail.conation.dev`, совпадающий с SMTP EHLO;
6. при закрытом исходящем TCP/25 или слабой репутации IP настроить
   аутентифицированный SMTP relay и безопасно передать его credentials;
7. определить bounce/complaint/abuse обработку, rate limits, retention,
   backup/restore и мониторинг очереди;
8. выполнить внешние receive/send/reply round trips минимум с Gmail и Outlook.

FusionAuth и Stalwart сейчас имеют разные credentials. Для единого входа нужен
отдельно настроенный Stalwart OIDC directory/client с issuer, client ID/secret,
redirect URI и стабильным email claim. Даже после этого Conation Inbox всё ещё
потребует JMAP OAuth/token propagation: одно только OIDC-подключение Stalwart
не создаёт application adapter.
