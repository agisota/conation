# Идентичность транзакционной почты в self-host Conation

Два контура не следует смешивать.

1. **Пользовательский inbox.** При `/email/init` без готового link, если выбран
   Stalwart (`EMAIL_PROVIDER=stalwart` или задан `STALWART_JMAP_URL`), сервис
   создаёт почтовый ящик в Stalwart и link `UserProvider::Stalwart`. Login уже
   на `@conation.dev` остаётся как есть; иначе local-part login-email получает
   `@conation.dev`. Затем best-effort заполнение inbox через JMAP (тело, флаги,
   вложения). Gmail — необязательная Google-интеграция, не условие появления
   inbox. Этот шаг не публикует MX/DKIM и не включает Internet delivery.

2. **Транзакционная идентичность.** Письма верификации, account-merge, invite и
   digest идут отдельно: RFC 5322 From и контакт поддержки задаются переменными
   ниже. Это не пользовательский JMAP-ящик.

По умолчанию Conation отправляет authentication и account-merge письма от
`auth@conation.dev`, а в качестве контакта поддержки показывает
`pythia@conation.dev`. Оператор другого домена должен задать в
authentication/notification deployment следующие значения.

| Переменная | Назначение | Значение Conation по умолчанию |
| --- | --- | --- |
| `AUTH_SENDER_EMAIL` | RFC 5322 From для верификации и account-merge сообщений | `auth@conation.dev` |
| `SUPPORT_EMAIL` | Контакт в footer верификации, merge и team-invite писем | `pythia@conation.dev` |
| `APP_BASE_URL` | Точный browser-facing корень приложения для referral, team/channel invite, merge-message branding и CTA в notification digest | `https://conation.dev/app` (или локальный URL с `/app`) |
| `INVITE_EMAIL_ASSET_BASE_URL` | Необязательная публичная директория Conation-логотипа; должна отдавать `logo192.png`. Если не задана, используется `APP_BASE_URL`. | как `APP_BASE_URL` |
| `OVERRIDE_NOTIFICATION_SERVICE_URL` | Публичный origin (при необходимости — с path prefix) notification service для HMAC-signed ссылки «Отписаться» в digest | URL сервиса для текущего окружения; в self-host задавайте явно |

Сервис отклоняет пустые или некорректные sender/support адреса на старте.
Публичные URL также валидируются до приёма работы: разрешены только абсолютные
`http(s)` URL без credentials, query и fragment; legacy `*.macro.com` hosts
отклоняются. Поэтому self-host оператор должен задать:

```text
APP_BASE_URL=https://conation.example/app
INVITE_EMAIL_ASSET_BASE_URL=https://assets.conation.example/brand
OVERRIDE_NOTIFICATION_SERVICE_URL=https://conation.example/notification
```

`INVITE_EMAIL_ASSET_BASE_URL` можно не задавать, если `logo192.png` доступен из
`APP_BASE_URL`. Значения должны быть доступны получателю письма из Internet, а
не только контейнерам во внутренней сети. Если notification service расположен
за reverse proxy под `/notification`, этот path prefix входит в URL подписи и
должен сохраняться при проксировании запроса.

Локальная разработка направляет транзакционные письма в Mailpit, когда задан
`SMTP_HOST`. Успешный health check Mailpit или Stalwart доказывает только
локальную SMTP-отправку или локальный JMAP: он не доказывает доставку в
Internet.

До публикации sender/support адресов в Internet оператор должен:

1. Создать оба mailbox либо осознанные aliases у выбранного mail provider
   (для Conation — Stalwart).
2. Опубликовать и проверить MX, SPF, DKIM и DMARC для домена отправителя.
3. Для собственного SMTP настроить reverse DNS/PTR и TLS либо подключить
   аутентифицированный relay.
4. Проверить bounce, abuse/complaint handling, reply routing и retention.
5. Провести внешние round-trip проверки: verification, account merge,
   invitation, digest unsubscribe и ответ support-аккаунту.

Не заявляйте production deliverability до успешных DNS и live round-trip
проверок. Не заявляйте, что публичные MX/DKIM уже сделаны: этот срез их не
закрывает. Секреты не помещаются ни в этот документ, ни в Git: relay/API
credentials передаются через secret store deployment.

Идемпотентный recipe ящиков поддержки Stalwart и оставшаяся публичная
DNS/TLS/relay работа описаны в
[`SELF_HOST_STALWART_MAILBOX_AUDIT_RU.md`](SELF_HOST_STALWART_MAILBOX_AUDIT_RU.md).
Ящики поддержки — операторские идентичности, не signup-mailbox пользователя.
Signup-mailbox появляется во встроенном inbox как Stalwart link; Gmail
подключать не обязательно.
