#!/usr/bin/env bash

# Prepare and, only after an explicit confirmation, publish a non-destructive
# Git ref archive for Conation. GitHub Issues and Pull Requests are server-side
# API objects, so this script intentionally never tries to recreate them.

set -euo pipefail
set +x
umask 077

readonly default_source_remote="origin"
readonly default_target_remote="conation-private"
readonly default_source_repository="macro-inc/macro"
readonly default_target_repository="agisota/conation"

mode="plan"
source_remote="$default_source_remote"
target_remote="$default_target_remote"
source_repository="$default_source_repository"
target_repository="$default_target_repository"
archive_output_directory=""
apply=false
write_archive=false
include_verbose_refs=false
confirmation_target=""
confirmation_source=""
work_directory=""
declare -a refspecs=()

usage() {
  printf '%s\n' \
    'Безопасное зеркало GitHub для Conation.' \
    '' \
    'Использование:' \
    '  mirror-github-repository.sh plan [общие опции]' \
    '  mirror-github-repository.sh publish-refs [общие опции] [--apply --confirm-target OWNER/REPO]' \
    '  mirror-github-repository.sh export-metadata-index [общие опции] [--write-archive --output-dir ABSOLUTE_OR_RELATIVE_PATH --confirm-source OWNER/REPO]' \
    '' \
    'Режимы:' \
    '  plan                   Только локальный dry run: отображает ref mapping, сети не касается.' \
    '  publish-refs           По умолчанию dry run. С --apply публикует только отсутствующие refs.' \
    '  export-metadata-index  По умолчанию план. С --write-archive создаёт локальный API index.' \
    '' \
    'Общие опции:' \
    '  --source-remote NAME       Remote upstream (по умолчанию: origin).' \
    '  --target-remote NAME       Remote целевого private repo (по умолчанию: conation-private).' \
    '  --source-repo OWNER/REPO   GitHub source (по умолчанию: macro-inc/macro).' \
    '  --target-repo OWNER/REPO   GitHub target (по умолчанию: agisota/conation).' \
    '  --verbose                  Показать каждый ref mapping в локальном плане.' \
    '  --apply                    Разрешить network mutation только для publish-refs.' \
    '  --confirm-target OWNER/REPO' \
    '                             Точное повторение target; обязательно вместе с --apply.' \
    '  --output-dir PATH          Новый каталог вне worktree для metadata index.' \
    '  --write-archive            Разрешить запись metadata index только для export-metadata-index.' \
    '  --confirm-source OWNER/REPO' \
    '                             Точное повторение source; обязательно вместе с --write-archive.' \
    '' \
    'Скрипт не принимает PAT как аргумент, не создаёт репозиторий, не удаляет refs' \
    'и не делает POST/PATCH/PUT/DELETE к GitHub API.'
}

die() {
  printf 'Ошибка: %s\n' "$*" >&2
  exit 1
}

require_command() {
  local command_name="$1"
  command -v "$command_name" >/dev/null 2>&1 || die "требуемая команда недоступна: $command_name"
}

validate_repository_name() {
  local repository="$1"
  [[ "$repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || \
    die "ожидалось GitHub-имя OWNER/REPO, получено: $repository"
}

remote_url_matches_repository() {
  local remote_url="$1"
  local repository="$2"

  case "$remote_url" in
    "https://github.com/${repository}"|"https://github.com/${repository}.git"|\
    "git@github.com:${repository}"|"git@github.com:${repository}.git"|\
    "ssh://git@github.com/${repository}"|"ssh://git@github.com/${repository}.git")
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

verify_local_remote() {
  local remote_name="$1"
  local repository="$2"
  local verify_push_url="${3:-false}"
  local fetch_url
  local push_url

  fetch_url="$(git remote get-url "$remote_name" 2>/dev/null)" || \
    die "локальный Git remote '$remote_name' не настроен"
  remote_url_matches_repository "$fetch_url" "$repository" || die \
    "fetch URL remote '$remote_name' указывает не на ожидаемый https/SSH URL github.com/$repository"

  if [[ "$verify_push_url" == true ]]; then
    push_url="$(git remote get-url --push "$remote_name" 2>/dev/null)" || \
      die "не удалось прочитать effective push URL remote '$remote_name'"
    remote_url_matches_repository "$push_url" "$repository" || die \
      "effective push URL remote '$remote_name' указывает не на ожидаемый https/SSH URL github.com/$repository"
  fi
}

require_github_authentication() {
  require_command gh
  gh auth status --hostname github.com >/dev/null 2>&1 || die \
    'GitHub CLI не аутентифицирован. Выполните gh auth login --hostname github.com --web с новым credential; не передавайте PAT в командной строке.'
}

verify_private_target_repository() {
  local actual_repository
  local private_value

  actual_repository="$(gh api --method GET "repos/$target_repository" --jq '.full_name')" || \
    die "не удалось прочитать target repository $target_repository через GitHub API"
  private_value="$(gh api --method GET "repos/$target_repository" --jq '.private')" || \
    die "не удалось проверить visibility target repository $target_repository"

  [[ "$actual_repository" == "$target_repository" ]] || die \
    "GitHub API вернул другой target repository: $actual_repository"
  [[ "$private_value" == "true" ]] || die \
    "target repository $target_repository должен быть private; публикация остановлена"
}

verify_source_repository_access() {
  local actual_repository

  actual_repository="$(gh api --method GET "repos/$source_repository" --jq '.full_name')" || \
    die "не удалось прочитать source repository $source_repository через GitHub API"
  [[ "$actual_repository" == "$source_repository" ]] || die \
    "GitHub API вернул другой source repository: $actual_repository"
}

cleanup_work_directory() {
  if [[ -n "${work_directory:-}" && -d "$work_directory" && "$work_directory" == "${TMPDIR:-/tmp}"/conation-github-mirror.* ]]; then
    rm -rf -- "$work_directory"
  fi
}

create_work_directory() {
  work_directory="$(mktemp -d "${TMPDIR:-/tmp}/conation-github-mirror.XXXXXXXX")"
  trap cleanup_work_directory EXIT HUP INT TERM
}

append_mapping() {
  local category="$1"
  local source_ref="$2"
  local target_ref="$3"
  local object_id="$4"

  [[ "$object_id" =~ ^[0-9a-f]{40,64}$ ]] || \
    die "не удалось получить object SHA для локального source ref: $source_ref"
  printf '%s\t%s\t%s\t%s\n' "$category" "$source_ref" "$target_ref" "$object_id"
}

collect_ref_mappings() {
  local source_prefix="refs/remotes/${source_remote}/"
  local pull_prefix="${source_prefix}pull/"
  local source_ref
  local short_name
  local object_id

  while IFS=$'\t' read -r source_ref object_id; do
    case "$source_ref" in
      "${source_prefix}HEAD"|"${pull_prefix}"*)
        continue
        ;;
      *)
        short_name="${source_ref#"$source_prefix"}"
        append_mapping "upstream-branches" "$source_ref" "refs/heads/upstream/$short_name" "$object_id"
        ;;
    esac
  done < <(git for-each-ref --format='%(refname)%09%(objectname)' --sort=refname "refs/remotes/$source_remote")

  while IFS=$'\t' read -r source_ref object_id; do
    append_mapping "upstream-tags" "$source_ref" "$source_ref" "$object_id"
  done < <(git for-each-ref --format='%(refname)%09%(objectname)' --sort=refname refs/tags)

  while IFS=$'\t' read -r source_ref object_id; do
    case "$source_ref" in
      "${pull_prefix}"*/head)
        short_name="${source_ref#"$pull_prefix"}"
        append_mapping "pull-request-heads" "$source_ref" "refs/heads/archive/pr/$short_name" "$object_id"
        ;;
      "${pull_prefix}"*/merge)
        short_name="${source_ref#"$pull_prefix"}"
        append_mapping "pull-request-merges" "$source_ref" "refs/heads/archive/pr/$short_name" "$object_id"
        ;;
    esac
  done < <(git for-each-ref --format='%(refname)%09%(objectname)' --sort=refname "${pull_prefix}")

  while IFS=$'\t' read -r source_ref object_id; do
    append_mapping "conation-branches" "$source_ref" "$source_ref" "$object_id"
  done < <(git for-each-ref --format='%(refname)%09%(objectname)' --sort=refname refs/heads/conation)
}

count_category() {
  local category="$1"
  local mapping_file="$2"
  awk -F '\t' -v category="$category" '$1 == category { count += 1 } END { print count + 0 }' "$mapping_file"
}

print_ref_plan() {
  local mapping_file="$1"
  local total
  local category

  total="$(wc -l <"$mapping_file")"
  total="${total//[[:space:]]/}"

  if [[ "$mode" == "publish-refs" && "$apply" == true ]]; then
    printf '%s\n' 'Предварительный локальный plan: до этого места сеть и GitHub API не использовались.'
  else
    printf '%s\n' 'Режим: локальный dry run. Сеть и GitHub API не использовались.'
  fi
  printf '%s\n' \
    "Source remote: $source_remote ($source_repository)" \
    "Target remote: $target_remote ($target_repository)" \
    '' \
    'Планируемые refs:'
  for category in upstream-branches upstream-tags pull-request-heads pull-request-merges conation-branches; do
    printf '  %-24s %s\n' "$category" "$(count_category "$category" "$mapping_file")"
  done
  printf '%s\n' \
    "  всего                    $total" \
    '' \
    'Refs с уже существующим, но другим SHA при публикации вызовут отказ: скрипт не использует force-push и не удаляет refs.'

  if [[ "$include_verbose_refs" == true ]]; then
    printf '%s\n' '' 'Полный mapping:'
    while IFS=$'\t' read -r category source_ref target_ref object_id; do
      printf '  [%s] %s -> %s (%s)\n' "$category" "$source_ref" "$target_ref" "$object_id"
    done <"$mapping_file"
  fi
}

prepare_ref_mappings() {
  local mapping_file="$1"

  verify_local_remote "$source_remote" "$source_repository"
  collect_ref_mappings >"$mapping_file"
  [[ -s "$mapping_file" ]] || die 'локальный mapping пуст; публикация остановлена'
}

assert_refspec_budget() {
  local refspec
  local refspec_bytes=0
  local argument_limit

  for refspec in "${refspecs[@]}"; do
    refspec_bytes=$((refspec_bytes + ${#refspec} + 1))
  done
  argument_limit="$(getconf ARG_MAX 2>/dev/null || printf '2097152')"

  if (( refspec_bytes > argument_limit / 2 )); then
    die "список refspec занимает $refspec_bytes байт при ARG_MAX=$argument_limit; разбейте перенос осознанно, не выполняя слепой mirror-push"
  fi
}

prepare_publish_refspecs() {
  local mapping_file="$1"
  local remote_refs_file="$work_directory/target-refs.tsv"
  local category
  local source_ref
  local target_ref
  local object_id
  local conflict_count=0
  local already_present_count=0
  local remote_object_id
  local -A remote_objects=()

  verify_local_remote "$target_remote" "$target_repository" true
  git ls-remote --refs "$target_remote" >"$remote_refs_file"

  while IFS=$'\t' read -r object_id target_ref; do
    remote_objects["$target_ref"]="$object_id"
  done <"$remote_refs_file"

  refspecs=()
  while IFS=$'\t' read -r category source_ref target_ref object_id; do
    remote_object_id="${remote_objects[$target_ref]:-}"
    if [[ -z "$remote_object_id" ]]; then
      refspecs+=("$source_ref:$target_ref")
    elif [[ "$remote_object_id" == "$object_id" ]]; then
      already_present_count=$((already_present_count + 1))
    else
      printf 'Конфликт ref: %s уже имеет SHA %s, локальный source %s имеет %s\n' \
        "$target_ref" "$remote_object_id" "$source_ref" "$object_id" >&2
      conflict_count=$((conflict_count + 1))
    fi
  done <"$mapping_file"

  (( conflict_count == 0 )) || die \
    "найдено конфликтующих refs: $conflict_count. Ничего не опубликовано; выберите отдельную стратегию, не force-push."
  assert_refspec_budget
  printf 'Remote preflight: %d refs уже совпадают, %d refs будут добавлены.\n' \
    "$already_present_count" "${#refspecs[@]}"
}

verify_published_refs() {
  local mapping_file="$1"
  local remote_refs_file="$work_directory/verified-target-refs.tsv"
  local category
  local source_ref
  local target_ref
  local object_id
  local remote_object_id
  local -A remote_objects=()

  git ls-remote --refs "$target_remote" >"$remote_refs_file"
  while IFS=$'\t' read -r object_id target_ref; do
    remote_objects["$target_ref"]="$object_id"
  done <"$remote_refs_file"

  while IFS=$'\t' read -r category source_ref target_ref object_id; do
    remote_object_id="${remote_objects[$target_ref]:-}"
    [[ "$remote_object_id" == "$object_id" ]] || die \
      "post-push verification не прошла для $target_ref: ожидалось $object_id, получено ${remote_object_id:-отсутствует}"
  done <"$mapping_file"
}

print_metadata_index_plan() {
  if [[ "$write_archive" == true ]]; then
    printf '%s\n' 'Режим metadata index: подтверждённая локальная запись. GitHub mutation не предусмотрена; далее будут только GET-запросы.'
  else
    printf '%s\n' 'Режим metadata index: dry run. Никаких API вызовов и файлов пока не будет.'
  fi
  printf '%s\n' \
    "Source repository: $source_repository" \
    '' \
    'После --write-archive будут выполнены только GET-запросы к:' \
    '  - issues?state=all (исходный список Issue, включая PR issue records);' \
    '  - pulls?state=all (снимок PR);' \
    '  - labels и milestones.' \
    '' \
    'В index намеренно не входят комментарии, timeline events, реакции, reviews и review comments.' \
    'Он является проверяемым каталогом перед отдельной, policy-driven миграцией, а не обещанием точного переноса GitHub metadata.'
}

validate_archive_output_directory() {
  local repository_root
  local archive_parent

  require_command realpath
  repository_root="$(realpath -e "$(git rev-parse --show-toplevel)")"
  archive_output_directory="$(realpath -m "$archive_output_directory")"
  archive_parent="$(dirname -- "$archive_output_directory")"

  [[ -d "$archive_parent" ]] || die \
    "родительский каталог metadata archive должен уже существовать: $archive_parent"
  [[ ! -e "$archive_output_directory" ]] || die \
    "output directory уже существует; отказ от перезаписи: $archive_output_directory"
  [[ "$archive_output_directory" != "$repository_root" && "$archive_output_directory" != "$repository_root"/* ]] || die \
    'metadata archive нельзя записывать внутрь worktree: это снижает риск случайно закоммитить private GitHub data'
}

download_paginated_json() {
  local endpoint="$1"
  local output_file="$2"

  gh api --method GET --paginate --slurp "$endpoint" >"$output_file"
}

write_metadata_index() {
  local partial_directory="${archive_output_directory}.partial.$$"
  local retrieved_at
  local issue_count
  local pull_request_issue_count
  local pull_request_count

  validate_archive_output_directory
  [[ ! -e "$partial_directory" ]] || die \
    "временный archive directory уже существует; не перезаписываю: $partial_directory"
  mkdir -- "$partial_directory"

  download_paginated_json \
    "repos/$source_repository/issues?state=all&per_page=100" \
    "$partial_directory/issues-and-pull-requests.pages.json"
  download_paginated_json \
    "repos/$source_repository/pulls?state=all&per_page=100" \
    "$partial_directory/pull-requests.pages.json"
  download_paginated_json \
    "repos/$source_repository/labels?per_page=100" \
    "$partial_directory/labels.pages.json"
  download_paginated_json \
    "repos/$source_repository/milestones?state=all&per_page=100" \
    "$partial_directory/milestones.pages.json"

  # gh api --paginate --slurp returns an array of response pages. Preserve that
  # exact shape in *.pages.json, then explicitly flatten it for consumers and
  # counts; a single .[] would otherwise address pages rather than API objects.
  jq '[.[] | .[]]' "$partial_directory/issues-and-pull-requests.pages.json" \
    >"$partial_directory/issues-and-pull-requests.json"
  jq '[.[] | .[]]' "$partial_directory/pull-requests.pages.json" \
    >"$partial_directory/pull-requests.json"
  jq '[.[] | .[]]' "$partial_directory/labels.pages.json" >"$partial_directory/labels.json"
  jq '[.[] | .[]]' "$partial_directory/milestones.pages.json" >"$partial_directory/milestones.json"

  jq '[.[] | select(.pull_request == null)]' \
    "$partial_directory/issues-and-pull-requests.json" >"$partial_directory/issues.json"
  jq '[.[] | select(.pull_request != null)]' \
    "$partial_directory/issues-and-pull-requests.json" >"$partial_directory/pull-request-issues.json"

  issue_count="$(jq 'length' "$partial_directory/issues.json")"
  pull_request_issue_count="$(jq 'length' "$partial_directory/pull-request-issues.json")"
  pull_request_count="$(jq 'length' "$partial_directory/pull-requests.json")"
  retrieved_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

  jq -n \
    --arg source_repository "$source_repository" \
    --arg target_repository "$target_repository" \
    --arg retrieved_at "$retrieved_at" \
    --argjson issue_count "$issue_count" \
    --argjson pull_request_issue_count "$pull_request_issue_count" \
    --argjson pull_request_count "$pull_request_count" \
    '{
      formatVersion: 1,
      sourceRepository: $source_repository,
      intendedTargetRepository: $target_repository,
      retrievedAt: $retrieved_at,
      kind: "github-api-metadata-index",
      counts: {
        issues: $issue_count,
        pullRequestIssueRecords: $pull_request_issue_count,
        pullRequests: $pull_request_count
      },
      includes: [
        "raw paginated GitHub API responses in *.pages.json",
        "normalized flat arrays for Issue, Pull Request, label, and milestone lists",
        "derived Issue-only and Pull-Request-Issue arrays"
      ],
      intentionallyExcludes: [
        "Issue and Pull Request comments",
        "timeline events",
        "reaction actors",
        "reviews and review comments",
        "GitHub server identities, numbers, and original creation timestamps"
      ]
    }' >"$partial_directory/manifest.json"

  printf '%s\n' \
    'Это metadata index, а не точная миграция server-side GitHub объектов.' \
    'Скрипт создавал его только GET-запросами и никогда не передавал credential как аргумент.' \
    'Не коммитьте этот каталог: он может содержать private Issue/PR content.' \
    'Если процесс прервался до rename, каталог .partial.<pid> оставлен намеренно для аудита.' \
    >"$partial_directory/README.txt"

  mv -- "$partial_directory" "$archive_output_directory"
  printf 'Metadata index записан в %s (issues: %s, PR issue records: %s, PR: %s).\n' \
    "$archive_output_directory" "$issue_count" "$pull_request_issue_count" "$pull_request_count"
}

parse_arguments() {
  if (( $# > 0 )); then
    case "$1" in
      plan|publish-refs|export-metadata-index)
        mode="$1"
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "неизвестный режим: $1 (используйте --help)"
        ;;
    esac
  fi

  while (( $# > 0 )); do
    case "$1" in
      --source-remote)
        (( $# >= 2 )) || die '--source-remote требует значение'
        source_remote="$2"
        shift 2
        ;;
      --target-remote)
        (( $# >= 2 )) || die '--target-remote требует значение'
        target_remote="$2"
        shift 2
        ;;
      --source-repo)
        (( $# >= 2 )) || die '--source-repo требует OWNER/REPO'
        source_repository="$2"
        shift 2
        ;;
      --target-repo)
        (( $# >= 2 )) || die '--target-repo требует OWNER/REPO'
        target_repository="$2"
        shift 2
        ;;
      --output-dir)
        (( $# >= 2 )) || die '--output-dir требует путь'
        archive_output_directory="$2"
        shift 2
        ;;
      --apply)
        apply=true
        shift
        ;;
      --write-archive)
        write_archive=true
        shift
        ;;
      --confirm-target)
        (( $# >= 2 )) || die '--confirm-target требует OWNER/REPO'
        confirmation_target="$2"
        shift 2
        ;;
      --confirm-source)
        (( $# >= 2 )) || die '--confirm-source требует OWNER/REPO'
        confirmation_source="$2"
        shift 2
        ;;
      --verbose)
        include_verbose_refs=true
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "неизвестная опция: $1"
        ;;
    esac
  done
}

main() {
  local mapping_file

  parse_arguments "$@"
  require_command git
  validate_repository_name "$source_repository"
  validate_repository_name "$target_repository"

  case "$mode" in
    plan)
      [[ "$apply" == false && "$write_archive" == false ]] || die \
        'режим plan не принимает --apply или --write-archive'
      create_work_directory
      mapping_file="$work_directory/ref-mapping.tsv"
      prepare_ref_mappings "$mapping_file"
      print_ref_plan "$mapping_file"
      ;;
    publish-refs)
      [[ "$write_archive" == false ]] || die \
        'режим publish-refs не принимает --write-archive'
      create_work_directory
      mapping_file="$work_directory/ref-mapping.tsv"
      prepare_ref_mappings "$mapping_file"
      print_ref_plan "$mapping_file"
      if [[ "$apply" == false ]]; then
        printf '%s\n' '' 'Публикация не выполнялась. Для network mutation нужны одновременно --apply и --confirm-target.'
        return
      fi
      [[ "$confirmation_target" == "$target_repository" ]] || die \
        "для публикации повторите target точно: --confirm-target $target_repository"
      require_github_authentication
      verify_private_target_repository
      prepare_publish_refspecs "$mapping_file"
      if (( ${#refspecs[@]} == 0 )); then
        printf '%s\n' 'Все refs уже совпадают; network mutation не требуется.'
        return
      fi
      printf 'Публикую %d новых refs атомарно в %s…\n' "${#refspecs[@]}" "$target_repository"
      git push --atomic "$target_remote" "${refspecs[@]}"
      verify_published_refs "$mapping_file"
      printf 'Публикация и SHA verification завершены: %s.\n' "$target_repository"
      ;;
    export-metadata-index)
      [[ "$apply" == false ]] || die \
        'режим export-metadata-index не принимает --apply; он никогда не выполняет GitHub mutation'
      print_metadata_index_plan
      if [[ "$write_archive" == false ]]; then
        printf '%s\n' '' 'Запись index не выполнялась. Для локального archive нужны --write-archive, --output-dir и --confirm-source.'
        return
      fi
      [[ -n "$archive_output_directory" ]] || die \
        'для metadata index обязателен --output-dir вне worktree'
      [[ "$confirmation_source" == "$source_repository" ]] || die \
        "для записи metadata index повторите source точно: --confirm-source $source_repository"
      require_command jq
      require_github_authentication
      verify_source_repository_access
      write_metadata_index
      ;;
  esac
}

main "$@"
