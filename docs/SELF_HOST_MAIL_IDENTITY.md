# Идентичность транзакционной почты в self-host Conation

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

Локальная разработка направляет письма в Mailpit, когда задан `SMTP_HOST`.
Успешный health check Mailpit или Stalwart доказывает только локальную отправку:
он не доказывает доставку в Internet и не делает support mailbox рабочим
пользовательским inbox.

До публикации sender/support адресов оператор должен:

1. Создать оба mailbox либо осознанные aliases у выбранного mail provider.
2. Опубликовать и проверить MX, SPF, DKIM и DMARC для домена отправителя.
3. Для собственного SMTP настроить reverse DNS/PTR и TLS либо подключить
   аутентифицированный relay.
4. Проверить bounce, abuse/complaint handling, reply routing и retention.
5. Провести внешние round-trip проверки: verification, account merge,
   invitation, digest unsubscribe и ответ support-аккаунту.

Не заявляйте production deliverability до успешных DNS и live round-trip
проверок. Секреты не помещаются ни в этот документ, ни в Git: relay/API
credentials передаются через secret store deployment.

Для Stalwart support mailboxes есть отдельный idempotent operator recipe, но
они пока не подключены к Gmail-only web inbox. Полный trace, secret contract и
оставшаяся JMAP/OIDC работа описаны в
[`SELF_HOST_STALWART_MAILBOX_AUDIT_RU.md`](SELF_HOST_STALWART_MAILBOX_AUDIT_RU.md).
