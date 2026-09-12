# Документация Conation

Индекс операторских и продуктовых документов в `docs/`. Канон для
стабилизации — [PRD](PRD_CONATION_STABILIZATION.md) и
[SPAC](SPAC_CONATION_STABILIZATION.md).

## Runtime и продукт

| Документ | О чём |
| --- | --- |
| [LOCALIZATION.md](LOCALIZATION.md) | `User.locale`, `conation-locale`, `PATCH /auth/user/locale`; digest/invite уже per-recipient; разрыв — push/FusionAuth |
| [REBRAND_CONATION.md](REBRAND_CONATION.md) | Что можно переименовать как copy, что является identity/compat |
| [CONATION_INTEGRATIONS_RU.md](CONATION_INTEGRATIONS_RU.md) | Production-секреты и контуры; inbox по умолчанию — Stalwart, Gmail необязателен |
| [SELF_HOST_MAIL_IDENTITY.md](SELF_HOST_MAIL_IDENTITY.md) | Signup-ящик `@conation.dev` и отличие от Gmail |
| [SELF_HOST_STALWART_MAILBOX_AUDIT_RU.md](SELF_HOST_STALWART_MAILBOX_AUDIT_RU.md) | Что уже создаётся на `/email/init`, что осталось на DNS/TLS/relay |
| [self-hosting-support-accounts.md](self-hosting-support-accounts.md) | Рецепт support-ящиков; не Gmail-only inbox |
| [RUNNING_LOCALLY.md](RUNNING_LOCALLY.md) | Локальный stack без Google/Gmail |

## Запуск и инфраструктура

Self-host Compose и почта: `infra/selfhost/README.md`.
Локальные сервисы и Cursor Cloud: `CLAUDE.md` / `.claude/skills/run-app`.

Этот индекс не дублирует значения секретов и не утверждает, что internet
MX/DKIM или MinIO-as-app-S3 уже настроены.
