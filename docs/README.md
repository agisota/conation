# Документация Conation

Индекс операторских и архитектурных документов в `docs/`. Корневой
[README](../README.md) остаётся точкой входа для сборки и запуска; этот файл
только направляет к тематическим страницам.

Документы описывают текущее дерево и оставшиеся границы. Они не обещают
internet-facing production, публичный MX/DKIM или полный перевод каждой
исторической строки.

## Стабилизация продукта

| Документ | Содержание |
| --- | --- |
| [PRD стабилизации](./PRD_CONATION_STABILIZATION.md) | Оставшаяся работа после self-host, ребренда, i18n-scaffold, Stalwart signup и task board |
| [SPAC стабилизации](./SPAC_CONATION_STABILIZATION.md) | Нормативные спецификация, план, архитектура и контракты срезов |

## Запуск и self-host

| Документ | Содержание |
| --- | --- |
| [Локальный запуск](./RUNNING_LOCALLY.md) | Web-сборка, полный локальный контур, standalone/Tauri-артефакт |
| [Статус self-host](../infra/selfhost/README.md) | Однохостовая база без управляемого облака; не internet production |
| [Аудит Stalwart inbox](./SELF_HOST_STALWART_MAILBOX_AUDIT_RU.md) | Signup создаёт `UserProvider::Stalwart`; остались DNS/TLS/relay |
| [Идентичность почты](./SELF_HOST_MAIL_IDENTITY.md) | Inbox Stalwart vs транзакционный From/`SUPPORT_EMAIL` |
| [Аккаунты поддержки](./self-hosting-support-accounts.md) | Рецепт ящиков поддержки в self-host Stalwart |

## Продукт и бренд

| Документ | Содержание |
| --- | --- |
| [Локализация](./LOCALIZATION.md) | `User.locale`, `PATCH /auth/user/locale`, `conation-locale`, fan-out gap |
| [Ребрендинг](./REBRAND_CONATION.md) | Что можно называть Conation; что остаётся совместимостным Macro |
| [Интеграции](./CONATION_INTEGRATIONS_RU.md) | Greenfield-секреты и публичные адреса `conation.dev` (без значений) |
| [ТЗ онбординга и бренда](./TZ_ONBOARDING_BRAND_RU.md) | Факты репозитория и живого `app.conation.dev` |
| [Стартовые ассеты](./STARTER_CONTENT_ASSETS.md) | Контент и изображения стартового workspace |
| [Визуальный реестр ассетов](./assets/ASSET_VISUAL_INVENTORY_RU.md) | Ручная проверка production-ассетов; партии 2–4 рядом |

## Инженерия

| Документ | Содержание |
| --- | --- |
| [Стиль кода](./STYLE_GUIDE.md) | Конвенции Rust/TypeScript и архитектурные запреты |
| [Cloud Storage](./CLOUD_STORAGE.md) | Карта `services/`, `crates/` и `infra/` backend |
| [Внешние зависимости](./EXTERNAL_DEPENDENCIES_RU.md) | Сборка не должна тянуть артефакты `macro-inc` |
| [Зеркало GitHub](./GITHUB_MIRROR_RU.md) | Воспроизводимая публикация в `agisota/conation` |
| [Cursor agent transport](./CURSOR_AGENT_TRANSPORT.md) | Третий transport сессий агента — как реализовано |
| [Property target entity types](./PROPERTY_TARGET_ENTITY_TYPE_PLAN.md) | План канонических типов; код по нему ещё не менялся |

## Что этот индекс не покрывает

- Значения секретов и токены. Их нет в git.
- Internet DNS/MX/DKIM, CalDAV, APNS/FCM, Pulumi org migration.
- Исторические документы upstream Macro, которые не относятся к Conation.
