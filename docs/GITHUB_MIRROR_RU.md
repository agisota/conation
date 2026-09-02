# Зеркало upstream и веток Conation

Статус на 2 сентября 2026 года: Git-объекты получены локально, но публикация в
`agisota/conation` ещё не подтверждена. Этот документ и
[`mirror-github-repository.sh`](../tooling/scripts/mirror-github-repository.sh)
делают перенос воспроизводимым и намеренно не используют ранее показанные в
чате credentials.

## Что именно можно перенести

Git и GitHub хранят разные классы данных. Скрипт публикует Git refs, а не
притворяется, что GitHub Issue и Pull Request — это Git-объекты.

| Локальный источник | Целевой namespace | Назначение |
| --- | --- | --- |
| `refs/remotes/origin/<ветка>` | `refs/heads/upstream/<ветка>` | Полная история upstream без смешения с ветками продукта. |
| `refs/tags/<тег>` | `refs/tags/<тег>` | Upstream tags с исходными SHA. |
| `refs/remotes/origin/pull/<N>/head` | `refs/heads/archive/pr/<N>/head` | Commit, лежавший в head PR. |
| `refs/remotes/origin/pull/<N>/merge` | `refs/heads/archive/pr/<N>/merge` | Сохранённый GitHub merge ref, если он был доступен. |
| `refs/heads/conation/*` | `refs/heads/conation/*` | Все собственные ветки Conation, включая рабочие и release-варианты. |

`refs/remotes/origin/HEAD` намеренно не публикуется: это локальная ссылка на
default branch upstream, а не ветка, которую надо переносить.

На момент проверки локальный план содержит 687 upstream-веток, 222 тега, 6 050
PR head refs, 81 PR merge ref и 15 веток `conation/*`. Эти цифры не являются
жёсткой константой: перед публикацией авторитетен новый локальный `plan`.

Две важные ветки продукта остаются отдельными:

1. `conation/upstream-sync` сохраняет parent из upstream и годится для
   последующего осознанного обновления от источника.
2. `conation/standalone-snapshot` — самостоятельный root commit с тем же
   продуктовым tree. Это не попытка скрыть происхождение: лицензия, NOTICE и
   archive upstream сохраняются.

`conation/main` и остальные `conation/*` тоже входят в mapping. Скрипт не
меняет default branch и не удаляет лишние remote refs.

## Почему `git push --mirror` здесь запрещён

`git push --mirror` синхронизирует все namespace и может удалить refs, которые
есть на target, но отсутствуют локально. В текущем worktree смешаны upstream
refs, PR refs и собственные ветки Conation, поэтому для них нужен явный mapping
выше.

Скрипт действует иначе:

- перед публикацией сравнивает SHA target с локальным источником;
- уже совпадающие refs пропускает;
- при одном несовпадающем SHA останавливается до push;
- не использует `--force` и не посылает ref deletion;
- публикует новые refs одним `git push --atomic`, затем заново проверяет SHA.

Это безопаснее первого переноса в новый private repository, но не заменяет
осознанную миграционную политику при будущем конфликте refs.

## Безопасный запуск refs

Сначала выполняется строго локальный plan: ему не нужны GitHub credentials и
он не обращается в сеть.

```bash
bash tooling/scripts/mirror-github-repository.sh plan
```

Проверить будущую публикацию без изменения сервера можно так:

```bash
bash tooling/scripts/mirror-github-repository.sh publish-refs
```

Для фактической публикации нужны все условия ниже.

1. Создан **private** репозиторий `agisota/conation`; скрипт сам репозиторий не
   создаёт, чтобы не превратить опечатку в внешнюю мутацию.
2. В `git remote -v` есть `origin` → `macro-inc/macro` и
   `conation-private` → `agisota/conation`. Для target скрипт проверяет и fetch
   URL, и **effective push URL** (`remote.<name>.pushurl`, если он настроен),
   поэтому скрытый/ошибочный `pushurl` не сможет перенаправить публикацию.
   URL с embedded credential отвергается.
3. GitHub CLI аутентифицирован свежим credential. Безопасный интерактивный
   вариант:

   ```bash
   gh auth login --hostname github.com --web
   gh auth status --hostname github.com
   gh auth setup-git
   ```

   Если организация использует `GH_TOKEN`, его передают только через secret
   environment/session manager. Скрипт не принимает токен флагом, не выводит
   его и не включает в Git URL. Credentials, когда-либо попадавшие в чат или
   логи, нужно отозвать и не использовать. `gh auth setup-git` настраивает
   Git credential helper для HTTPS remote; при SSH remote вместо него нужен
   SSH-ключ с правом записи в target.
4. Явно повторено имя destination в команде:

   ```bash
   bash tooling/scripts/mirror-github-repository.sh publish-refs \
     --apply \
     --confirm-target agisota/conation
   ```

`--apply` без точного `--confirm-target` останавливается. Перед любым push
скрипт проверяет `gh auth status`, существование target через API, его private
visibility и все конфликтующие SHA. При `gh` без авторизации или target не
private он ничего не меняет.

Для refs понадобятся permissions на запись Contents; если в переносе есть
workflow-файлы, GitHub может требовать также Workflows write. Права на Issues и
Pull requests не нужны для ref-only публикации.

## Issues и Pull Requests: что возможно, а что нет

### Точная server-side миграция

Номера Issue/PR, исходный автор как GitHub identity, оригинальный server
timestamp, reviews, reactions, подписчики и состояние Pull Request — это
серверные сущности GitHub. Обычный Git push не может их создать или сохранить.
Создать новые Issue/PR через REST API означает получить **новые** номера,
автора-импортёра и timestamp; closed/merged PR нельзя сделать исторически
идентичным объектом простым POST-запросом.

Единственные способы, которые могут сохранить server-side identity на уровне
платформы, требуют полномочий, которых у fork обычно нет:

- [repository transfer](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository) — административный доступ к исходному репозиторию;
- [GitHub Enterprise Importer](https://docs.github.com/en/migrations/using-github-enterprise-importer/migrating-repositories-from-githubcom-to-github-enterprise-cloud) — соответствующая Enterprise migration role в source и destination.

Поэтому нельзя честно обещать «полную копию всех PR и Issues» через обычный
PAT. Можно сохранить Git history/refs и сделать проверяемый архив metadata,
затем отдельно согласовать, какие новые Issue/PR создавать и какие ссылки на
исходные объекты оставлять.

### Архивный metadata index

Следующая команда по умолчанию тоже только показывает план и не вызывает API:

```bash
bash tooling/scripts/mirror-github-repository.sh export-metadata-index
```

После отдельного подтверждения она создаёт **новый каталог вне worktree** с
приватным JSON index. Пример пути намеренно не находится в repository:

```bash
bash tooling/scripts/mirror-github-repository.sh export-metadata-index \
  --write-archive \
  --output-dir /secure/migration-archives/macro-2026-09-02 \
  --confirm-source macro-inc/macro
```

Index содержит raw paginated API responses в `*.pages.json` для
`issues?state=all`, `pulls?state=all`, labels и milestones. Рядом лежат
нормализованные плоские JSON-массивы, отдельные `issues.json`,
`pull-request-issues.json` и `manifest.json` с counts/границами архива.
Сохранение обоих представлений важно: `gh api --paginate --slurp` возвращает
массив страниц, а не один плоский список объектов. Все запросы скрипта — `GET`;
он не выполняет `POST`, `PATCH`, `PUT` или `DELETE` к GitHub API.

Это **не** архив комментариев, timeline events, реакций, reviews или review
comments. Для 6+ тысяч PR полный discussion export должен быть отдельным
rate-limit-aware и возобновляемым процессом с согласованной схемой хранения;
его нельзя подменять коротким скриптом и потом называть точной миграцией.
Каталог может содержать private content и не должен коммититься.

## Приёмка после публикации

- Скрипт завершил post-push SHA verification для каждого ref из плана.
- В target есть `upstream/*`, `archive/pr/*` и все требуемые `conation/*`; PR
  archive refs существуют как Git refs, а не как якобы восстановленный GitHub
  PR UI.
- Никакие существующие refs target не были force-updated или удалены.
- Если создавался metadata index, `manifest.json` хранит source URL/счётчики и
  явно перечисляет всё, чего в нём нет.
- Новый independent release review подтверждает лицензию, NOTICE/атрибуцию и
  отсутствие secrets, временных экспортов и upload originals в Git history.
