# Архитектура и статус локализации

Conation — Russian-first продукт. Новый браузерный профиль запускается на
русском языке независимо от языка операционной системы. Английский остаётся
исходным каталогом и fallback: это позволяет сохранять однозначный source copy,
не смешивая перевод с TypeScript/JSX-кодом.

Документ фиксирует текущий runtime-контракт и непокрытые области. Он не
утверждает, что каждая историческая строка UI, письмо или push уже переведены.

## Frontend-контракт

Каноническая реализация находится в `apps/web/src/lib/i18n`. Модуль
`apps/web/src/lib/core/i18n` — только compatibility re-export; в нём нельзя
создавать второй каталог или отдельное locale-state.

- Поддерживаются locale `ru` и `en`.
- `SOURCE_LOCALE` — `en`; `DEFAULT_LOCALE` — `ru`.
- Сохранённое значение `conation-locale` имеет приоритет. Если его нет или оно
  некорректно, выбирается русский; `navigator.language` намеренно не меняет
  Russian-first default.
- Переключатель языка в настройках аккаунта обновляет Solid signal без
  перезагрузки и сохраняет выбор в `localStorage`.
- `<html lang>` синхронизируется при инициализации, переключении и storage-event
  из другой вкладки.
- Если русского сообщения нет, используется английское. Если ключ отсутствует
  в обоих каталогах, на экран выводится сам ключ, чтобы дефект был заметен.

Английский source и русский runtime default не противоречат друг другу:
«source» определяет авторитетный текст для разработчиков и fallback, а
«default» — первый язык интерфейса пользователя.

## Ключи и качество перевода

Новые ключи должны быть смысловыми и принадлежать домену, например:

```text
settings.account.language.label
auth.login.continue
channel.thread.moreReplies
```

Новые `auto.*` ключи запрещены. Первичная синтаксически-небезопасная экстракция
больше не является рабочим процессом; канонические каталоги и executable source
не содержат таких вызовов или ключей.

В `t(...)` нельзя передавать:

- идентификаторы, enum и generic types;
- routes, URL, package names и import paths;
- analytics/protocol/API values;
- SQL names, persisted values и fixture data;
- регулярные выражения и строки с примерами кода.

Русские формы числа оформляются одним ICU MessageFormat-сообщением с
`one`/`few`/`many`/`other`, а не склеиваются вручную. `select` также должен
находиться внутри сообщения. Оба каталога проверяются парсером ICU.

## Числа, даты и относительное время

Общие форматтеры экспортируются из `lib/i18n`:

- `formatNumber`;
- `formatDateTime`;
- `formatRelativeTime`;
- `getDateLocale` для кода, которому нужен locale существующего `Intl` API.

Для русского используется `ru-RU`, для английского — `en-US`. Новый feature-
код не должен добавлять hardcoded `en-US` или собирать локализуемую дату из
английских фрагментов. В старых feature-модулях ещё встречаются прямые вызовы
`Intl`; их нужно проверять по одному, потому что часть из них намеренно работает
с timezone/машинными значениями.

## Передача locale в backend

`safeFetch` добавляет `Accept-Language` к first-party application requests,
если вызывающий код не установил заголовок сам. На произвольные third-party URL
этот заголовок намеренно не отправляется.

Остальные транспорты — WebSocket, отдельные generated clients, jobs и queues —
нужно проверять отдельно. Наличие заголовка в `safeFetch` ещё не означает
полную backend-локализацию.

В authentication service подтверждён узкий рабочий путь: endpoint генерации
ссылки подтверждения email читает `Accept-Language`, а `backend_i18n` рендерит
русскую или английскую тему/HTML. Некорректный или отсутствующий заголовок
переходит на Russian-first default.

## Непокрытая backend-граница

Персональная русская локализация асинхронных invitation, digest, notification,
push и большинства email пока не подтверждена. Locale получателя ещё не
сохраняется как пользовательская настройка в основной БД и не проходит через
все async envelopes.

Особенно опасно брать locale отправителя или текущего HTTP request: один job
может рассылать один и тот же текст получателям с разными языками. Правильный
порядок дальнейшей миграции:

1. Добавить locale preference в существующую пользовательскую schema через
   сгенерированную SQLx migration. Имя таблицы `macro_user` пока является
   внутренним schema-контрактом; новые пользовательские principals при этом
   используют канонический prefix `conation|`.
2. Добавить authenticated read/update API и синхронизацию браузерного выбора.
3. Разрешать locale отдельно для каждого получателя до рендеринга текста.
4. Передавать locale через jobs/queues с backward-compatible Russian default.
5. Рендерить mixed-locale fan-out по получателям, а не клонировать один body.
6. Отдельно настроить FusionAuth, push и внешние mail templates.

Адрес отправителя, DNS domain, queue field, metadata tag и database column —
не переводимые строки. Их rebrand требует configuration/migration и проверки
доставляемости, а не замены в языковом каталоге. Подробная классификация — в
[карте ребрендинга](REBRAND_CONATION.md).

## Проверка

Frontend-проверки запускаются так:

```bash
\cd apps/web
bunx vitest run --project i18n src/lib/i18n/index.test.ts
bun run type-check
bunx vite build -c vite.config.ts
```

Behavioral tests должны подтверждать:

- Russian-first default и сохранение выбранного языка;
- синхронизацию `<html lang>`;
- английский fallback;
- ICU plural/select для характерных русских форм;
- locale-aware числа, даты и relative time;
- отсутствие `auto.*` и полное покрытие английских ключей русским каталогом;
- отсутствие `Accept-Language` на third-party requests.

Тесты `backend_i18n` не требуют БД. Для DB-backed service tests сначала
запускается `bash .cursor/infra.sh`, затем из корня —
`cargo test -p <crate>` с незаданным `SQLX_OFFLINE`.

Если будущая локализация меняет SQL, нужна additive migration и
`nix develop --command just prepare_db`. Файлы `.sqlx` вручную не редактируются.

## Критерий готовности

Локализацию можно назвать полной только после одновременного выполнения
следующих условий:

- аудит всех пользовательских UI-путей не находит непреднамеренного английского;
- catalog parity и ICU tests проходят;
- каждый backend delivery path выбирает locale по получателю;
- email/push/invite snapshots проверены на русском и английском;
- legacy literals остаются только как классифицированные protocol/fixture/
  compatibility values;
- smoke-тест подтверждает переключение языка в реально запущенном приложении.
