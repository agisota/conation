# Внешние зависимости исходной сборки Conation

Дата аудита: 2 сентября 2026 года.

Этот документ описывает зависимости, которые могут обращаться к внешней сети
при чистой сборке исходного кода. Главная проверяемая гарантия этого среза:
сборка Conation больше не должна получать исходники или бинарные артефакты с
ресурсов, принадлежащих `macro-inc`.

Это **не** гарантия полностью автономной (air-gapped) сборки. При пустых кэшах
по-прежнему нужны публичные GitHub, crates.io, npm/Bun, источники Nix flake и
`cache.nixos.org`. Для изолированной сети потребуется отдельный зеркальный
контур или vendoring этих публичных зависимостей.

## Итог

| Контур | Состояние | Влияние на чистую сборку |
| --- | --- | --- |
| Git-зависимости `macro-inc/*` | Заменены на тот же Git object через публичный non-Macro fork network URL | Macro GitHub organization не нужна; для долгосрочной гарантии нужны собственные mirrors |
| `macro-inc.cachix.org` | Удалён из sandbox/worker Dockerfiles | При cache miss Nix собирает из публичных исходников; cold build дольше |
| GitHub Packages scope `macro-inc` | Удалён из lexical-service image | `GITHUB_PACKAGES_TOKEN` не нужен для Bun install этого image |
| Приватный S3 Nix cache Conation | Опционален | Без credentials не подключается и не блокирует source build |
| Приватный репозиторий Conation в agent image | Опциональный тёплый слой | Без BuildKit secret образ собирается «холодным»; clone/realization происходят позднее |
| Старые Pulumi/GitHub organization names | Не являются источниками зависимостей, но остаются hosted deployment bindings | Не блокируют локальную сборку; старые production workflows нельзя считать независимым deploy-контуром |

## Заменённые Macro pins

Git commit является content-addressed объектом: одинаковый полный SHA означает
одинаковое дерево и историю commit независимо от fork URL. Перед заменой каждый
commit был отдельно получен командой `git fetch --depth 1 <upstream> <sha>`.
Важно: GitHub хранит объекты общей fork network, поэтому успешный fetch по SHA
не означает, что custom commit вошёл в default branch официального upstream.
Проверенные custom commits не имеют прямых refs в выбранных upstream URL. Это
устраняет текущий запрос к Macro, но не заменяет собственное долговечное зеркало.

| Компонент | Старый источник | Канонический источник и pin | Лицензия и замечания |
| --- | --- | --- | --- |
| JS API и Rust plugins `auth`/`notifications` | `macro-inc/tauri-plugins` | [`inKibra/tauri-plugins@6ddd6600…`](https://github.com/inKibra/tauri-plugins/commit/6ddd6600e20436388f169e936b610fe93944b7b0) | Репозиторий содержит Apache-2.0 и MIT license files; корневой JS `package.json` декларирует ISC. Это несовпадение metadata нужно сохранить в SBOM/third-party notices и проверить перед дистрибуцией. Имя пакета `@inkibra/tauri-plugins` принадлежит upstream и не является брендингом Conation. |
| Tauri `http`/`websocket` и transitively `fs` | `macro-inc/plugins-workspace` | [`tauri-apps/plugins-workspace@06474e4c…`](https://github.com/tauri-apps/plugins-workspace/commit/06474e4c446600627cf37a11f0c22c27bcf764ca) | Официальная Tauri fork network, `Apache-2.0 OR MIT`; custom merge не находится на прямом upstream ref, поэтому нужен Conation mirror |
| `pdfjs-dist` web build | annotated tag `macro-inc/pdf.js@v2.16.52-web` | [`mozilla/pdf.js@0265ecba…`](https://github.com/mozilla/pdf.js/commit/0265ecba1b16edbaa6a803e9d783cb2fbdea3e21) | Macro tag object `f9b2ce66…` указывал на custom `Remove eval` commit в Mozilla fork network, а не на принятый upstream release; Apache-2.0. Bun lock пересоздан package manager, поскольку GitHub archive integrity зависит и от repository path. Нужен mirror или воспроизводимый patch поверх официального release. |
| LibreOfficeKit Rust bindings | `macro-inc/rs-libreoffice-bindings` | [`whutchinson98/rs-libreoffice-bindings@056a40dd…`](https://github.com/whutchinson98/rs-libreoffice-bindings/commit/056a40ddfac1d9650be30b9f0b4b934e9266c7dc) | Fork network исходного публичного проекта, MIT; pin на один commit опережает `whutchinson98/main` и требует mirror |
| Старый fork `rig` | Только лишний ключ в `nix-support/root-cargo-output-hashes.nix` | Удалён: активный `Cargo.lock` использует `rig-agent`/`rig-core` 0.41 с crates.io | Старый commit также существует в публичном `0xPlaygrounds/rig`, но сборка его не запрашивает |

## Остальные Git pins

Они не принадлежат Macro, но являются сетевыми входами cold build. Полный SHA
из lock-файла является частью воспроизводимости.

| Источник | Зафиксированный commit | Статус upstream / лицензия | Действие |
| --- | --- | --- | --- |
| `agentclientprotocol/rust-sdk` | `8769d16d10e0c9fa7e662ee18424a4313b06ea88` | Официальный публичный проект, Apache-2.0 | Оставить до релиза с требуемой WASM-поддержкой |
| `whutchinson98/jsonwebtoken` | `c8c0d19511a0e7ba9d456e21437a79d321e99f16` | Публичный non-Macro fork; commit является его `master`/`HEAD`, MIT. Объект виден и в fork network `Keats/jsonwebtoken`, но custom fork остаётся стабильным именованным ref. | Сохранить URL, добавить полный `rev` в manifest |
| `tursodatabase/turso` | `79163249538197d01dec5ea7f65519454ed792e2` | Официальный публичный проект, MIT | Оставить pin |
| `seanaye/tauri` | `95a7521b8c565cfba568319ddd8ba79c9ce244e2` | Публичный non-Macro fork, commit закреплён веткой `macro-fork`; Apache-2.0/MIT. Объект доступен через fork network `tauri-apps/tauri`, но custom commit не является default upstream history. | Сохранить стабильный fork URL; исторический восьмизначный `rev` в manifest разрешается lock-файлом в этот полный SHA |
| `voxelbee/tauri-plugin-virtual-keyboard` | `70e8e8325b5ff7d681ef5f3b996ac083d4fc5a01` | Публичный самостоятельный репозиторий; в проверенном tree нет LICENSE, а Cargo manifest не декларирует license | Зафиксировать полный `rev`; до публичной дистрибуции получить явную лицензию либо заменить/реализовать plugin внутри Conation |

В дереве также лежит
`apps/web/tauri/src-tauri/Cargo.lock`, созданный до перехода Tauri на общий
workspace lock. Он содержит старый URL `seanaye/tauri-plugins`, который GitHub
сейчас перенаправляет в `macro-inc/tauri-plugins`. Cargo workspace использует
`apps/web/tauri/Cargo.lock`, поэтому вложенный файл не участвует в разрешении
зависимостей. Его следует удалить отдельным явным cleanup-коммитом после
проверки всех legacy mobile scripts, а не вручную переписывать как активный lock.

## Nix caches

### Публичный Macro Cachix

`macro-inc.cachix.org` был жёстко добавлен в два agent Docker image. Это был
только read-only substituter: flake inputs и исходники не хранились исключительно
там. Настройка удалена из:

- `crates/agent_harness/container/Dockerfile`;
- `services/coding-agent-worker/container/Dockerfile`.

Nix сохраняет стандартный `cache.nixos.org`; при отсутствии готового binary
substitute derivation строится из публичных исходников. Поэтому функциональная
независимость достигнута ценой более долгого первого build.

### Приватный Conation S3 cache

`.cursor/cloud-lib.sh` включает `s3://conation-nix-cache` только если заданы обе
runtime secrets:

- `NIX_CACHE_AWS_ACCESS_KEY_ID`;
- `NIX_CACHE_AWS_SECRET_ACCESS_KEY`.

GitHub action `.github/actions/setup-nix/action.yml` ещё строже: substituter
включается только при наличии URL, public signing key и обеих S3 credentials.
Если комплект неполный, action продолжает работу без private cache. Публикация
артефактов дополнительно использует `NIX_CACHE_SIGNING_KEY`; этот secret не
нужен потребителю или source build.

## Что не является сетевой зависимостью исходников

- `@macro-inc/infra-web-app` в `infra/package.json`/`infra/bun.lock` — локальное
  имя workspace package, а не скачиваемый пакет.
- SQL/table/module identifiers с `macro` не разрешаются через package manager.
- Старые URL и имена в fixtures/snapshots не загружаются сборкой, если они не
  используются как endpoint в выполняемом тесте.

Но следующие строки являются реальными **deployment control-plane bindings**:

- Pulumi stacks `macro-inc/dev` и `macro-inc/prod`;
- GitHub runner target `https://github.com/macro-inc`;
- workflow stack parameters `macro-inc/<environment>`.

Они не мешают `cargo build`, `bun build` или локальному self-host, но AWS/Pulumi
production workflow нельзя запускать как Conation production deployment, пока
не создана собственная Pulumi organization и не перенесено state. Простая
замена текста потеряет связь с существующим state и поэтому запрещена.

## Приватный Conation repository в agent images

Тёплая сборка agent image принимает read-only BuildKit secret `github_token`.
Минимальный доступ: fine-grained GitHub token только к целевому Conation repo с
permission `Contents: Read`. Передача:

```bash
docker buildx build \
  --secret id=github_token,env=GH_TOKEN \
  -f crates/agent_harness/container/Dockerfile \
  crates/agent_harness/container
```

Токен не должен передаваться через build ARG, URL или записываться в image.
Без secret clone приватного repo пропускается, и image остаётся рабочим, но
первый runtime clone и `nix develop` будут холодными. Для публичного mirror
secret не требуется: задайте безопасный `CONATION_REPO_URL` при сборке.

## Полностью автономный контур

Для air-gapped build поверх достигнутой Macro-независимости понадобятся:

1. Cargo vendor или внутреннее crates.io sparse mirror, включая Git pins.
2. Bun/npm registry mirror и зеркала GitHub archive dependencies.
3. Внутреннее зеркало всех locked Nix flake inputs и собственный подписанный
   binary cache.
4. SBOM с сохранёнными license/notice файлами; сначала разрешить отсутствие
   лицензии у `tauri-plugin-virtual-keyboard`.
5. Регулярная проверка, что зеркала содержат именно зафиксированные hashes, а
   credentials имеют read-only scope для builders.

### Минимальные права и процедура создания mirrors

Нужна новая, не публиковавшаяся в чате GitHub credential:

- право создавать private repositories у владельца/организации Conation;
- `Contents: Write` только для четырёх создаваемых mirror repositories;
- builders после создания получают отдельный token только с `Contents: Read`.

Токен передаётся через `GH_TOKEN`/Git credential helper, но не включается в URL
remote или shell history. Для каждого источника оператор сначала делает bare
mirror публичной fork network, проверяет объект `git cat-file -e <sha>^{commit}`,
создаёт private remote, отправляет refs и создаёт защищённый vendor tag на
нужном SHA. Лишь после успешной проверки `git fetch <private-url> <sha>` можно
менять manifest. Не надо выдавать mirror CI доступ к issues, actions, packages
или administration после создания.

Не следует создавать фиктивные `agisota/*` fork URL до фактического создания
репозитория и переноса commit objects. Собственные mirrors обязательны для трёх
custom объектов без upstream ref: `tauri-plugins@6ddd6600…`,
`plugins-workspace@06474e4c…`, `pdf.js@0265ecba…`, а также для
`rs-libreoffice-bindings@056a40dd…`. Критерий приёмки: `git fetch <mirror>
<full-sha>` возвращает тот же SHA и в mirror создан защищённый tag. После этого
lock-файл обновляется соответствующим package manager, а Nix output hash — через
штатную Nix/Cargo генерацию.

## Проверки этого среза

Выполнены из корня репозитория:

```text
bun install --lockfile-only       exit 0
bun install --frozen-lockfile     exit 0
nix flake metadata --offline .    exit 0
nix flake show --offline --json . exit 0
nix build --offline --dry-run --no-link .#cargoArtifacts
                                     exit 0
nix build --offline --dry-run --no-link .#tauri-desktop-cargo-artifacts
                                     exit 0
env -u SQLX_OFFLINE nix develop --command cargo metadata --locked ...
                                     exit 0 (root и Tauri workspace)
docker buildx build --check ...   exit 0 (оба agent image и lexical image)
bun test services/coding-agent-worker/src/provision.test.ts  15/15
bun run --cwd services/lexical-service check                 exit 0
git diff --check                  exit 0 для изменённых файлов среза
```

При регенерации Tauri lock штатный Cargo resolver переназначил зависимость
`tauri-utils` с `toml 1.1.2` на уже присутствующий `toml 0.9.12`. Manifest
fork-а допускает диапазон `>=0.9, <=1`, а другие Tauri plugins требуют
`toml ^0.9`; попытка принудить `1.1.2` через `cargo update --precise` корректно
отклонена resolver-ом. Эта единственная сопутствующая связь сохранена как
package-manager output, а не отредактирована вручную.

Дополнительный cold-cache probe с единственным substituter
`https://cache.nixos.org/` дошёл до локальной сборки отсутствующих публичных
Nix derivations. Его остановили вручную, чтобы не занимать ресурсы параллельной
проверки workspace; это свидетельство работающего source fallback, но **не**
завершённый `nix develop` и не должно учитываться как зелёный build.

Полный compile/build Tauri и всего Cargo workspace не относится к этому
ограниченному срезу; его должны выполнять общие проверки проекта. Активные
lock-файлы были пересозданы штатными package managers и оба проходят
`cargo metadata --locked`.
