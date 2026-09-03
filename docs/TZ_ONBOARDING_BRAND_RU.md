# ТЗ: онбординг, бренд, русская база, рабочие поверхности

Статус: рабочий документ по фактам репозитория и живого `https://app.conation.dev` на 2026-09-02.
Источник правды: код, Caddy, Stalwart, FusionAuth. Не маркетинговый бриф.

## 0. Что пользователь видит сейчас

После passwordless входа открывается шелл Conation: сайдбар есть, основная область пустая (чёрная/тёмная «дыра»). Клики по вкладкам сайдбара не открывают сущность.

Причина в коде, не в «ещё не нарисовали»:

1. `DEFAULT_ROUTE` был `/component/inbox`. Inbox в runtime — **только Gmail**. Без Google-гранта это пустой viewer.
2. Preview Pair открывает соседний Viewer с placeholder «Select an item…». Без строк в списке viewer пустой.
3. Интерактивный туториал (`InteractiveOnboarding`) рисует **песочницу**, не живое пространство. Вкладки в демо не навигируют продукт. Fallback демо — lockup с `opacity-25` на тёмном поле: «блеклый логотип на чёрном».
4. Онбординг v4 (`/onboarding`) завязан на PostHog-флаг `enable-onboarding-v4` и OAuth-коннекторы (Gmail, Linear, …). На self-host флаг/коннекторы отсутствуют → поток обрезан.
5. `GET https://app.conation.dev/app` (без `/`) отдавал пустой `200` без HTML. Исправление: `redir /app /app/ 308`.

Первый патч в коде (ещё нужен rebuild бандла):

- `DEFAULT_ROUTE` → `/component/getting-started`
- lockup без принудительной чёрной пластины и без `opacity-25`
- Google SSO скрыт в `standalone`

Пока бандл не пересобран и не выложен в `/srv/conation/app`, живой сайт этих правок не показывает.

## 1. Цель продукта на self-host

Корпоративный контур на 50 человек: русский как **исходный** язык UI и стартового контента; английский — второй, переключаемый. Бренд Conation (орбита/favicon) везде, где пользователь видит марку. Никакого Macro, Google-кнопки входа, Gmail-only пустого inbox как домашнего экрана.

Успех: новый пользователь с email-кодом за 2 минуты видит **русское Getting Started**, может открыть документ, поиск, канал поддержки, агента. Вкладки сайдбара открывают соответствующие панели с понятным empty state на русском, не чёрный экран.

## 2. Онбординг и «гифки»

В репозитории **нет** tutorial GIF/WebP/MP4. Есть:

- `apps/web/src/features/onboarding/` — интерактивные уроки на **мок-шелле** (`MockAppChrome` + sandbox store): сайдбар, command-K, markdown mentions, create-entity.
- `apps/web/src/features/setup/flow/` — onboarding v4: почта Google, коннекторы, команда, план. Для self-host непригоден как обязательный путь.
- Getting Started checklist — правильная посадочная после входа.

### 2.1 Что подготовить (онбординг)

| ID | Поставка | Критерий |
| --- | --- | --- |
| ONB-1 | Self-host путь: passwordless → Getting Started. Onboarding v4 не блокирует вход | Без PostHog и без Google пользователь попадает в приложение |
| ONB-2 | Туториал либо выключен на standalone, либо работает на **живом** шелле, не на мёртвом моке | Клик по «Почта/Документы/…» в туториале либо меняет реальный сайдбар, либо туториал не перекрывает продукт |
| ONB-3 | Если оставляем уроки: 4 экрана на русском с Conation-скриншотами (не Macro, не Gmail-онбординг) | Статика в `apps/web/public/onboarding/` или живой sandbox с русскими сущностями |
| ONB-4 | Skip/Finish пишет `tutorialComplete=true` и редирект на Getting Started | Нет пинг-понга Layout ↔ onboarding |
| ONB-5 | Мок-вкладки не выглядят как сломанный продукт | Либо интерактив, либо явная подпись «демонстрация» |
| ONB-6 | Empty state каждой панели на русском: Inbox без Gmail, Документы без файлов, Поиск без индекса, Агент без ключа | Не пустой чёрный viewer |

Скриншоты/гифки: снимать с **нашего** UI после фикса Getting Started, ru-locale, логотипа. Не использовать Macro-артефакты. Формат: WebP, тёмная и светлая тема, 1600px по ширине.

## 3. Локализация (русский в основе)

Факт: каталоги `apps/web/src/lib/i18n/locales/{en,ru}.json` большие; часть ключей `auto.*`; бэкенд-письма почти все английские; `html lang` на логине `ru` из index.html, дальше зависит от рантайма.

### 3.1 Правила

- Исходный язык продукта для этого деплоя: **ru**. `en` — переключение, не база копирайта.
- Новые строки: семантические ключи (`shell.inbox.empty.title`), не `auto.*`.
- Не переводить идентификаторы, URL, фикстуры протоколов, SQL, имена пакетов.
- ICU для плюралов и дат (`Intl` / существующий i18n helper), не ручная склейка.

### 3.2 Поставки

| ID | Поверхность | Работа |
| --- | --- | --- |
| LOC-1 | Рантайм-переключатель ru/en на логине и в настройках, persist, `document.documentElement.lang` | Отдельная сессия i18n |
| LOC-2 | Сайдбар, Getting Started, empty states, command menu, settings | Все видимые подписи |
| LOC-3 | Уроки онбординга и sandbox-сущности (названия документов/каналов в демо) | Русские примеры Conation |
| LOC-4 | Стартовые документы / how-to / support channel copy | Русский Conation, не Macro |
| LOC-5 | Письма FusionAuth passwordless (уже RU шаблон) + verification/invite/digest | Locale получателя, не угадывать с отправителя |
| LOC-6 | Аудит `auto.*` и hardcoded JSX | Список ключей + замена только user-visible |

## 4. Бренд и логотип

Файлы мастеров: `apps/web/public/brand/`

- `conation-app-icon-master-v1.png` — марка (орбита), она же смысл favicon
- `conation-favicon.svg`
- `conation-combined-lockup-master-v1.png` — знак + слово
- `conation-wordmark-master-v1.png`

Баг UI: `ConationLockup` сидел на `bg-black ring-white/10`; на светлом логине это тёмная капсула. В демо `opacity-25`. На логине было `h-16 w-64` (~64px высоты).

### 4.1 Поставки

| ID | Правило |
| --- | --- |
| BR-1 | На светлом фоне lockup **без** чёрной пластины, непрозрачный |
| BR-2 | Логин: lockup не ниже ~96px по высоте (`h-24` / `w-[22rem]`) |
| BR-3 | Favicon, apple-touch, PWA, сайдбар, агент-аватар — один orbit-icon |
| BR-4 | Корпоративные аккаунты `pythia@`, `tars@`, `ramzan.kadyrov@` — аватар = тот же favicon/orbit, не чужие SVG-портреты, если они «странные» |
| BR-5 | Запрет Macro-логотипов, macro.com, «Macro Dark» как **видимая** подпись (внутренний theme id может жить) |
| BR-6 | Ручной визуальный проход всех поверхностей логина, сайдбара, онбординга, Getting Started, письма |

FusionAuth не хранит аватар из нашего SVG сам. Нужно: либо загрузить PNG favicon как image этим трём users через FA API, либо фронтовый override `UserIcon` для `conation|pythia@…` / tars / ramzan → `conation-favicon.svg`.

## 5. Корпоративные технические аккаунты

Уже заведены в Stalwart (не в inbox приложения):

| Адрес | Роль в продукте |
| --- | --- |
| `pythia@conation.dev` | поддержка |
| `tars@conation.dev` | технический директор |
| `ramzan.kadyrov@conation.dev` | генеральный директор |
| `auth@conation.dev` | транзакционный отправитель (опционально) |
| `no-reply-local@conation.dev` | текущий SMTP From |

Нужно в Conation/FusionAuth (не только в почте):

| ID | Работа |
| --- | --- |
| ACC-1 | Те же email как пользователи FusionAuth + Conation `conation\|email` |
| ACC-2 | displayName русские: Пифия, Тарс, Рамзан Кадыров |
| ACC-3 | Аватар = favicon |
| ACC-4 | Канал поддержки / стартовый how-to от Пифии, не от Macro-бота |
| ACC-5 | Не требуют Google. Passwordless как у всех |

## 6. Поверхности, которые должны открываться с сайдбара

Self-host standalone paths уже проксируются Caddy на `:24009`. Пустой UI ≠ мёртвый API.

| Сайдбар | Ожидание без внешних OAuth | Сейчас |
| --- | --- | --- |
| Getting Started | Чеклист на русском | Не default route до патча |
| Inbox | Честный empty state: «подключите почту позже» / без Gmail | Чёрная дыра, Gmail-only |
| Документы | Пустой список + «Создать документ» реально создаёт md | Не проверено E2E в этой сессии |
| Поиск | Поле + «нет результатов» | OpenSearch локальный, не проверено с UI |
| Каналы | Канал поддержки или empty | Не проверено |
| Агент | Чат с ботом или «нет ключа модели» | harness крутится без ключей |
| Календарь/Activity | Скрыть или empty, не 500 | Feature flags |
| Настройки | Профиль, локаль, выход | Должно работать |

WebSocket `/sync` и `/connection-gateway`: 401 без сессии нормально; после логина должны апгрейдиться. Не нагрузочный тест — smoke: одно сообщение / один документ.

## 7. Что не входит в это ТЗ

- Полный отказ от AWS/LocalStack и переезд на fakecloud/rustack (отдельное экономическое решение).
- Production-inbox на Stalwart JMAP (отдельный slice, см. `SELF_HOST_STALWART_MAILBOX_AUDIT_RU.md`).
- Google SSO. Кнопка на standalone скрывается.
- Переписывание git history standalone vs upstream (идёт отдельным аудитом веток).

## 8. Порядок работ

1. Выложить пересобранный бандл (`DEFAULT_ROUTE`, логотип, без Google).
2. Проверить: логин → Getting Started, не пустой inbox.
3. Empty states на русском для inbox/docs/search/agent.
4. Аватары корпоративных аккаунтов = favicon.
5. Снять новые скрины онбординга с этого UI.
6. Переключатель языка.
7. Starter-контент на русском.

## 9. Критерии приёмки

- `/app` и `/app/` отдают один и тот же HTML приложения.
- После кода на почте пользователь видит Getting Started, не чёрный viewer.
- Клик «Документы» открывает панель документов.
- На логине lockup читаемый, не капсула 64px с opacity 25%.
- Три корпоративных пользователя с орбитой Conation.
- ru по умолчанию; en переключается и переживает reload.
- Google на логине standalone нет.
