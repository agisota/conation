# Зеркало upstream и ветки Conation

Статус на 2 сентября 2026 года. Этот документ описывает подготовленное локальное
состояние и безопасный порядок публикации; он не утверждает, что push уже
выполнен.

## Что уже есть локально

Из `macro-inc/macro` получены и проверены Git-объекты:

| Набор refs              | Количество |
| ----------------------- | ---------: |
| обычные remote branches |        688 |
| tags                    |        222 |
| pull-request head refs  |      6 050 |
| pull-request merge refs |         81 |

PR refs находятся под `refs/remotes/origin/pull/<number>/{head,merge}`. Целевой
remote уже настроен как `conation-private` →
`https://github.com/agisota/conation.git`, но GitHub CLI сейчас не
аутентифицирован, поэтому никакой push не выполнялся.

## Две ветки Conation

После финального QC должны быть опубликованы две независимые точки входа:

1. `conation/upstream-sync` — commit с родителем из upstream. Эта ветка хранит
   происхождение и подходит для последующего осознанного переноса upstream-
   изменений.
2. `conation/standalone-snapshot` — root commit без родителей с текущим
   Conation tree. Это чистая история самостоятельного продукта, а не способ
   скрыть происхождение: AGPL, NOTICE/атрибуция и upstream archive сохраняются.

Обе ветки формируются через временный Git index и `git commit-tree`, не меняя
реальный index и не выполняя checkout/reset рабочего дерева.

## Почему `git push --mirror` недостаточно

Git хранит commits, trees, blobs, tags и refs. GitHub Issues, PR state,
comments, reviews, labels, assignees и server timestamps — отдельные объекты
GitHub API. Поэтому mirror-push переносит код и PR commits, но не создаёт копию
интерфейса Issues/Pull requests.

Точный перенос GitHub metadata возможен только в одном из режимов:

- [repository transfer](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository) — требует административного доступа к исходному `macro-inc/macro`;
- [GitHub Enterprise Importer](https://docs.github.com/en/migrations/using-github-enterprise-importer/migrating-between-github-products/migrating-repositories-from-githubcom-to-github-enterprise-cloud) — требует Enterprise Cloud и роли owner/migrator в source и destination.

Для обычного приватного репозитория пользователя доступен только архивный
импорт через API. Он может сохранить в теле исходные URL, автора, timestamps,
state, labels, comments и review metadata, но GitHub-author и время создания
нового объекта будут принадлежать импортеру. Выдавать такой импорт за
побайтово точную server-side миграцию нельзя.

## Безопасная схема публикации

После QC и появления нового credential:

1. Ротировать все PAT, которые когда-либо попадали в чат или process output.
2. Передать новый fine-grained token только через secret окружения `GH_TOKEN`.
   Для кода нужны `Contents: read/write` и `Workflows: read/write`; для
   архивного metadata-импорта дополнительно `Issues: read/write` и
   `Pull requests: read/write`. Создание/настройка репозитория требует
   соответствующего administration permission.
3. Проверить `gh auth status` и что `agisota/conation` приватный.
4. Опубликовать upstream branches под `refs/heads/upstream/*`, чтобы они не
   конфликтовали с ветками продукта; tags оставить tags.
5. Опубликовать PR commits под `refs/heads/archive/pr/<number>/{head,merge}`.
6. Опубликовать `conation/upstream-sync` и `conation/standalone-snapshot`.
7. Экспортировать Issues/PR metadata в версионированный JSON archive и только
   после сверки количества запускать явно выбранный режим recreation.

GitHub рекомендует отдельный bare clone и mirror-push для обычного
[дублирования репозитория](https://docs.github.com/en/repositories/creating-and-managing-repositories/duplicating-a-repository),
но здесь ref mapping намеренно явный: в локальном рабочем repository есть и
upstream refs, и новые Conation branches.

## Приёмочные проверки

- SHA каждого опубликованного branch/tag/ref совпадает с локальным SHA.
- В целевом репозитории нет secret values, `previous.md`, root upload originals
  и локального `target` symlink.
- Обе Conation ветки содержат одинаковый product tree; различаются только
  parent/history policy.
- Metadata archive содержит исходные immutable IDs/URLs и контрольные counts.
- Любые recreation warnings и несовпадения authors/timestamps перечислены в
  отдельном migration report.
