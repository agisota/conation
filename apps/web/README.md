# Веб-клиент Conation

Это frontend Conation: статическое одностраничное приложение на
[SolidJS](https://www.solidjs.com/) и [Vite](https://vite.dev/). Браузерная
версия — самостоятельный клиент, а не оболочка desktop-приложения. В профиле
`standalone` она по умолчанию обращается к API через same-origin маршруты
Conation.

Подробная и актуальная инструкция для macOS/Linux находится в
[`docs/RUNNING_LOCALLY.md`](../../docs/RUNNING_LOCALLY.md). Этот файл оставляет
короткие команды именно для работы с web-клиентом и Tauri.

## Инструменты

Репозиторий использует [Nix](https://nixos.org/) для фиксированной toolchain и
[Bun](https://bun.sh/) для JavaScript-зависимостей и Vite. Из корня репозитория:

```bash
nix develop
bun install --frozen-lockfile
```

На macOS для полного локального стека отдельно нужен Docker runtime: Docker
Desktop, OrbStack или Colima. Nix предоставляет CLI, но не запускает macOS VM
или Docker daemon.

## Собрать web-клиент

```bash
\cd apps/web
just build-prod
just check-standalone-artifact
```

`build-prod` подготавливает WASM-компоненты и собирает `dist`. Проверка
`check-standalone-artifact` не допускает в standalone-артефакт управляемые
legacy endpoints и устаревшую URL-схему. Это статическая проверка: она не
заменяет работающий backend.

Если оператору нужен фиксированный origin вместо same-origin маршрутов, он
задаётся только во время сборки:

```bash
VITE_CONATION_OPERATOR_ORIGIN=https://conation.example just build-prod
```

Замените `conation.example` на реально контролируемый HTTPS origin. Для
самостоятельного развёртывания не используйте hosted-legacy профиль.

## Локальный продуктовый стек

Из корня репозитория:

```bash
just doctor-local
just run_local --no-doppler
```

Команда поднимает локальные Postgres, Redis, OpenSearch, Kafka, FusionAuth,
Mailpit, proxy и сервисы Conation. Логин по одноразовому коду работает без
облачных секретов; Google/Gmail, GitHub, реальные AI-провайдеры и доставка
Internet-почты без соответствующих credentials намеренно не эмулируются как
рабочие интеграции.

Для локального браузерного smoke-теста:

```bash
just local-e2e
```

Harness создаёт отдельный именованный стек, seed-данные и локальную bearer
авторизацию. Для интерактивного режима Playwright используйте
`just local-e2e-ui`.

## Tauri: native-клиенты

Standalone native-артефакты используют отдельную идентичность
`dev.conation.app`, а не bundle ID или deep link прежнего продукта. Для
разработки нужны Rust, Bun и Tauri CLI из Nix shell; дополнительно:

- Android: Android Studio, SDK/NDK и подходящий shell `nix develop
  .#tauri-android` на Linux;
- iOS/macOS: Xcode и Command Line Tools на macOS;
- desktop Linux: `nix develop .#tauri-linux` для GTK/WebKitGTK/GStreamer.

Базовые команды Tauri запускаются из `apps/web/tauri` в соответствующем
окружении:

```bash
cargo tauri dev
cargo tauri android dev
cargo tauri ios dev
```

Для standalone Tauri-сборки с явно заданным операторским origin используйте:

```bash
\cd apps/web
CONATION_OPERATOR_ORIGIN=https://conation.example just tauri-build-standalone
```

Сборка исходников не равна готовому store/release артефакту. Перед публичным
macOS/iOS/Android выпуском владелец Conation должен создать собственные App
IDs, signing certificates, provisioning profiles, APNS/SNS настройки и пройти
подпись/notarization. Эти внешние права и секреты не хранятся в репозитории.

## Граница готовности

Локальный web-стек и standalone-сборка пригодны для разработки и валидации.
Production self-host требует отдельно настроенных DNS/TLS, секретов,
наблюдаемости, backup/restore, облачных адаптеров и полноценного JMAP/Stalwart
mailbox lifecycle. Смотрите [статус self-host](../../infra/selfhost/README.md)
перед тем, как заявлять production-готовность.
