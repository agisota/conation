# Документация в `docs/`

Это индекс операторских и архитектурных документов репозитория. Пользовательский
сайт документации (Mintlify) живёт отдельно в [`apps/docs`](../apps/docs/README.md).
Корневой [README](../README.md) остаётся точкой входа для запуска.

Статус: документы в этом каталоге описывают **текущее дерево** `conation/main`.
Они не обещают интернет-production, публичный MX/DKIM или подписанный macOS-релиз.

Русский — runtime default нового профиля (`DEFAULT_LOCALE = ru`). Английский —
исходный каталог и fallback. Это уже в коде; массовая выгрузка `auto.*` не цель.

## Запуск и self-host

| Документ | О чём |
| --- | --- |
| [Локальный запуск](RUNNING_LOCALLY.md) | Сборка web, полный локальный контур, standalone/Tauri origin |
| [Статус self-host](../infra/selfhost/README.md) | Поддерживаемая однохостовая база vs неподдержанный internet production |
| [Учётные записи поддержки](self-hosting-support-accounts.md) | Support-аккаунты для локального/self-host контура |

## Почта и идентичность

Inbox по умолчанию — ящик Stalwart `@conation.dev` на `/email/init`, не Gmail.
Gmail — необязательная Google-интеграция. Публичный MX/DKIM в этом раунде нет.

| Документ | О чём |
| --- | --- |
| [Аудит Stalwart](SELF_HOST_STALWART_MAILBOX_AUDIT_RU.md) | Состав `/email/init`, JMAP, что ещё не internet-mail |
| [Идентичность транзакционной почты](SELF_HOST_MAIL_IDENTITY.md) | Пользовательский JMAP vs SMTP From/support для auth/invite/digest |
| [Интеграции](CONATION_INTEGRATIONS_RU.md) | Имена секретов и публичные адреса `conation.dev` без значений |

## Продукт и локализация

| Документ | О чём |
| --- | --- |
| [Локализация](LOCALIZATION.md) | `User.locale`, `PATCH /auth/user/locale`, `conation-locale`, fan-out gap |
| [Ребрендинг](REBRAND_CONATION.md) | Что можно называть Conation, какие `Macro` совпадения остаются контрактом |
| [Бренд onboarding](TZ_ONBOARDING_BRAND_RU.md) | Целевые identities и границы ассетов |
| [Стартовые ассеты](STARTER_CONTENT_ASSETS.md) | Seed-контент онбординга |

## Стабилизация (этот раунд)

Нормативные документы текущего среза. Исполнять контракты SPAC, не расширять scope.

| Документ | О чём |
| --- | --- |
| [PRD стабилизации](PRD_CONATION_STABILIZATION.md) | Цели, non-goals, критерии успеха |
| [SPAC](SPAC_CONATION_STABILIZATION.md) | Спецификация, план, архитектура, exclusive-write срезы |

## Разработка

| Документ | О чём |
| --- | --- |
| [Cloud Storage](CLOUD_STORAGE.md) | Карта `services/` / `crates/` / `infra/`, локальные тесты |
| [Style guide](STYLE_GUIDE.md) | Правила ревью `CS-*` / `FE-*`, `just check` |
| [Транспорт агента](CURSOR_AGENT_TRANSPORT.md) | Cursor/agent transport и ограничения |
| [Свойства entity](PROPERTY_TARGET_ENTITY_TYPE_PLAN.md) | План target entity type для свойств |
| [Внешние зависимости](EXTERNAL_DEPENDENCIES_RU.md) | Что тянется снаружи и что остаётся локальным |
| [Зеркало GitHub](GITHUB_MIRROR_RU.md) | Как публиковать refs в `agisota/conation` без `--mirror` |

Инвентаризация картинок и OCR-заметок — в [`assets/`](assets/). Это рабочие
заметки по ассетам, не операторский runbook.

## Чего здесь нет

- Пользовательские гайды продукта (inbox, задачи, агенты) — [`apps/docs`](../apps/docs).
- Значения секретов. Документы называют имена переменных, не credentials.
- Заявленная готовность интернет-почты, CalDAV, APNS/FCM, Pulumi-org Conation.
