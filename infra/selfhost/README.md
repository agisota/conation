# Conation Self-Host (single server, from source)

Полный селфхост Conation (форк Macro) на одном сервере из исходников. RU по умолчанию, Stalwart почта, MinIO S3, `api.rox.one/v1` дефолт (`rox/gpt-5.6-terra`).

## Быстрый старт

```bash
cp .env.selfhost.example .env.selfhost
$EDITOR .env.selfhost  # CONATION_DOMAIN, MINIO_*, STALWART_*

# 1. Сети
docker network create databases 2>/dev/null || true
docker network create auth 2>/dev/null || true

# 2. Поднять DB + infra
docker compose -f docker/docker-compose-databases.yml --env-file .env.selfhost up -d

# 3. Self-host stack (app + minio + stalwart + caddy)
docker compose -f docker/docker-compose.yml -f docker/docker-compose.selfhost.yml --env-file .env.selfhost up -d --build

# 4. Проверка
curl -f http://localhost:8080/health  # auth
curl -f http://localhost:9000/minio/health/live  # minio
curl -f http://localhost:8081/healthz || curl -f http://localhost:8081/  # stalwart
```

Фронт: `https://conation.dev` (Caddy LE) или `http://localhost:3000` (`bun run dev`).
`just selfhost up` — обёртка над compose (см `tooling/just/selfhost.just` если добавлен).

## DNS

```
A     conation.dev          -> <SERVER_IP>
A     mail.conation.dev     -> <SERVER_IP>
A     app.conation.dev      -> <SERVER_IP>
A     api.conation.dev      -> <SERVER_IP>
CNAME *.conation.dev        -> conation.dev (опц. preview)
MX    conation.dev 10 mail.conation.dev
TXT   conation.dev "v=spf1 ip4:<IP> ~all"
TXT   _dmarc.conation.dev "v=DMARC1; p=quarantine; rua=mailto:dmarc@conation.dev"
TXT   <dkim-selector>._domainkey.conation.dev "v=DKIM1; k=rsa; p=<STALWART_DKIM>"
PTR   <IP> -> mail.conation.dev (у хостера)
```

Stalwart генерирует DKIM: `docker exec stalwart stalwart-cli dmarc ...` или в логах.

## Почта — Stalwart (primary)

Каждый юзер получает `user@conation.dev` автоматически при signup.

- **JMAP:** `http://stalwart:8080` (внутри), `https://mail.conation.dev` (снаружи)
- **IMAP:** `993` TLS, **SMTP:** `25` + `587` STARTTLS
- **Провижининг:** `services/authentication_service` -> `StalwartProvider::provision_account` (`crates/email_provider/src/lib.rs`)
- **Gmail:** опц. `initGmailLink` остаётся, но не требуется. `EMAIL_PROVIDER=stalwart|gmail` (`services/email_service/src/config.rs`)
- **Push:** JMAP push (WebSocket) вместо GCP PubSub

Миграция Gmail: `stalwart` умеет `imap-migration` — можно стянуть старый ящик.

## LLM — rox.one (default)

- **Base URL:** `https://api.rox.one/v1` (`crates/agent/src/model/router.rs:57 ROX_BASE_URL`)
- **Default model:** `rox/gpt-5.6-terra` (`DEFAULT_ROX_MODEL`, `apps/web/src/lib/core/component/AI/constant/model.ts:45`)
- **Ключ:** пользователь получает сам на `rox.one`, вставляет в `Settings -> Models -> Rox API Key`. Сервер хранит только `ROX_BASE_URL`, ключ — per-user (`X-Rox-Api-Key` header). `BootStubEnv` (`tooling/xtask/crates/xtask_local/src/local/local_env.rs:597`) ставит `local-rox-key` для dev.
- **Fallback:** если `ROX_API_KEY` пуст — роутер регистрирует dummy для маршрутизации, вызовы вернут 401 пока юзер не введёт ключ.

## Локализация

- **Default:** `ru` (`apps/web/index.html:2 <html lang="ru">`, `apps/web/src/lib/i18n/index.ts:DEFAULT_LOCALE='ru'`)
- **Файлы:** `apps/web/src/lib/i18n/locales/ru.json` + `en.json`, `t(key, vars)` с `Intl.PluralRules` (ru `one/few/many/other`)
- **Даты:** `apps/web/src/lib/core/util/date.ts` locale-aware (`ru-RU` 24h vs `en-US` 12h), `Yesterday` -> `Вчера`
- **Переключение:** `localStorage['conation-locale']` + `document.documentElement.lang`, отправляется как `Accept-Language` на Rust

## Ветки

- `conation/main` — full fork с переписанной историей (`tooling/scripts/rebrand.sh --filter-repo` + `rebrand.replacements.txt`, `filter-repo`)
- `conation/overlay` — overlay патч поверх `upstream/main` (`macro-inc/macro`), `git fetch upstream && git merge upstream/main && ./tooling/scripts/rebrand.sh --reapply`)

Основная — `conation/main`.

## Обновление

```bash
git fetch origin
git merge origin/conation/main
# или overlay:
git fetch upstream && git merge upstream/main
./tooling/scripts/rebrand.sh
nix develop --command just prepare_db  # если SQL менялся
bun install && cargo check
```

## Бэкап

```bash
pg_dump postgres://user:password@localhost:5432/conationdb > backup.sql
mc mirror minio/doc-storage ./backup/minio
```

AGPLv3 — селфхост модификации должны публиковаться при сетевом доступе.
