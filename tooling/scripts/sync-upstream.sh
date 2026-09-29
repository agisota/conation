#!/usr/bin/env bash
set -Eeuo pipefail

readonly PRODUCTION_ROOT=/Users/t/Projects/CTN
readonly REMOTE=upstream
readonly REMOTE_BRANCH=refs/heads/main
readonly TRACKING_REF=refs/remotes/upstream/main
readonly MAIN_REF=refs/heads/main
readonly BACKUP_PREFIX=refs/heads/backup/upstream-sync

log() { printf 'sync-upstream: %s\n' "$*" >&2; }
die() { log "$*"; exit 1; }

# The override is intentionally restricted to a temporary fixture checkout.
if [[ -n "${SYNC_UPSTREAM_ROOT:-}" ]]; then
  [[ "${SYNC_UPSTREAM_FIXTURE:-}" == 1 ]] || die 'SYNC_UPSTREAM_ROOT is accepted only with SYNC_UPSTREAM_FIXTURE=1'
  ROOT=$(cd -- "$SYNC_UPSTREAM_ROOT" 2>/dev/null && pwd -P) || die 'fixture root is not a directory'
  case "$ROOT/" in
    /tmp/*|/private/tmp/*|/var/folders/*|/private/var/folders/*) ;;
    *) die 'fixture root must be inside the system temporary directory' ;;
  esac
else
  ROOT=$PRODUCTION_ROOT
  [[ -d "$ROOT" ]] || die "expected repository root is missing: $ROOT"
  ROOT=$(cd -- "$ROOT" && pwd -P)
fi

git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not a Git worktree: $ROOT"
actual_root=$(git -C "$ROOT" rev-parse --show-toplevel 2>/dev/null) || die 'cannot resolve worktree root'
actual_root=$(cd -- "$actual_root" && pwd -P)
[[ "$actual_root" == "$ROOT" ]] || die "repository root mismatch: $actual_root"
branch=$(git -C "$ROOT" symbolic-ref --quiet --short HEAD 2>/dev/null || true)
[[ "$branch" == main ]] || die "refusing to run outside branch main (current: ${branch:-detached})"
[[ "$(git -C "$ROOT" config --get core.bare || true)" != true ]] || die 'bare repository is not a sync target'
git -C "$ROOT" remote get-url "$REMOTE" >/dev/null 2>&1 || die 'required remote upstream is not configured'

COMMON_DIR=$(git -C "$ROOT" rev-parse --git-common-dir)
[[ "$COMMON_DIR" = /* ]] || COMMON_DIR="$ROOT/$COMMON_DIR"
COMMON_DIR=$(cd -- "$COMMON_DIR" && pwd -P)
LOCK="$COMMON_DIR/sync-upstream.lock"
if ! mkdir -- "$LOCK" 2>/dev/null; then
  die "another sync-upstream invocation holds $LOCK (remove it only after confirming no invocation is active)"
fi
worktree_path=
worktree_added=0
rebase_started=0
cleanup() {
  local status=$?
  trap - EXIT HUP INT TERM
  if [[ -n "$worktree_path" && "$worktree_added" == 1 ]]; then
    if [[ "$rebase_started" == 1 ]]; then
      git -C "$worktree_path" rebase --abort >/dev/null 2>&1 || true
    fi
    git -C "$ROOT" worktree remove --force "$worktree_path" >/dev/null 2>&1 || true
  fi
  rmdir -- "$LOCK" 2>/dev/null || true
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

WORKTREE_GIT_DIR=$(git -C "$ROOT" rev-parse --absolute-git-dir) || die 'cannot resolve Git operation directory'
check_operation_state() {
  local marker
  for marker in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD BISECT_LOG sequencer rebase-apply rebase-merge; do
    [[ ! -e "$WORKTREE_GIT_DIR/$marker" ]] || die "Git operation already in progress ($marker); finish it before syncing"
  done
}
check_clean() {
  local status
  status=$(git -C "$ROOT" status --porcelain=v1 --untracked-files=all) || die 'cannot inspect working tree status'
  [[ -z "$status" ]] || { log 'working tree has staged, unstaged, or untracked changes; refusing before mutation'; printf '%s\n' "$status" >&2; return 1; }
}
check_operation_state
check_clean || exit 1

old=$(git -C "$ROOT" rev-parse --verify "$MAIN_REF^{commit}") || die 'main does not point to a commit'
# Fetch exactly upstream/main; no prune, tags, push, or implicit remote HEAD.
if ! git -C "$ROOT" fetch --no-tags --no-prune "$REMOTE" "$REMOTE_BRANCH:$TRACKING_REF"; then
  die "fetch of $REMOTE/$REMOTE_BRANCH failed; main remains $old"
fi
upstream=$(git -C "$ROOT" rev-parse --verify "$TRACKING_REF^{commit}") || die 'fetched upstream/main is not a commit'
current=$(git -C "$ROOT" rev-parse --verify "$MAIN_REF^{commit}") || die 'main disappeared after fetch'
[[ "$current" == "$old" ]] || die "main changed during fetch (expected $old, found $current)"

if [[ "$old" == "$upstream" ]]; then
  log "already synchronized at $old; no backup or main rewrite"
  exit 0
fi
if git -C "$ROOT" merge-base --is-ancestor "$upstream" "$old"; then
  log "local main is ahead of upstream/main at $old; keeping local commits without rewrite"
  exit 0
fi
if git -C "$ROOT" merge-base --is-ancestor "$old" "$upstream"; then
  mode=fast-forward
else
  mode=diverged
fi

create_backup() {
  local stamp candidate zero attempt=0
  if [[ "${SYNC_UPSTREAM_FIXTURE:-}" == 1 && -n "${SYNC_UPSTREAM_TEST_STAMP:-}" ]]; then
    stamp=$SYNC_UPSTREAM_TEST_STAMP
  else
    stamp=$(date -u '+%Y%m%dT%H%M%SZ')
  fi
  zero=$(printf '%*s' "${#old}" '' | tr ' ' 0)
  while (( attempt < 100 )); do
    candidate="$BACKUP_PREFIX-$stamp-$attempt"
    if git -C "$ROOT" -c core.fsync=reference -c core.fsyncMethod=fsync update-ref "$candidate" "$old" "$zero" 2>/dev/null; then
      [[ "$(git -C "$ROOT" rev-parse --verify "$candidate")" == "$old" ]] || die "backup readback failed for $candidate"
      printf '%s\n' "$candidate"
      return 0
    fi
    ((attempt += 1))
  done
  die 'could not allocate a unique create-only backup ref after 100 attempts'
}
backup=$(create_backup) || exit 1
log "retained pre-update backup $backup -> $old"

# Recheck checkout state and captured main at the mutation boundary. The
# expected-old update-ref below is authoritative against uncoordinated writers.
check_operation_state
check_clean || die 'working tree became dirty after fetch; main was not changed'
current=$(git -C "$ROOT" rev-parse --verify "$MAIN_REF^{commit}") || die 'main disappeared before update'
[[ "$current" == "$old" ]] || die "stale main ref (expected $old, found $current); backup retained at $backup"
[[ "$(git -C "$ROOT" rev-parse --verify "$backup")" == "$old" ]] || die "backup changed before update: $backup"

candidate=$upstream
if [[ "$mode" == diverged ]]; then
  worktree_path="${TMPDIR:-/tmp}/sync-upstream-worktree-$$"
  [[ ! -e "$worktree_path" ]] || die "temporary worktree path already exists: $worktree_path"
  git -C "$ROOT" worktree add --detach "$worktree_path" "$old" >/dev/null || die 'could not create disposable rebase worktree'
  worktree_added=1
  rebase_started=1
  if ! git -C "$worktree_path" -c rebase.autoStash=false rebase --rebase-merges --onto "$upstream" "$(git -C "$ROOT" merge-base "$old" "$upstream")"; then
    die "rebase conflict; main remains $old, local work is retained, backup $backup"
  fi
  rebase_started=0
  rebased=$(git -C "$worktree_path" rev-parse --verify HEAD^{commit}) || die 'cannot resolve rebased candidate'
  tree=$(git -C "$worktree_path" rev-parse --verify "$rebased^{tree}") || die 'cannot resolve rebased tree'
  # Keep original main as first parent for the installed main-ref ancestry gate.
  candidate=$(printf 'Sync upstream/main %s; retain old main %s\n' "$upstream" "$old" | git -C "$ROOT" commit-tree "$tree" -p "$old" -p "$rebased") || die 'cannot create provenance bridge commit'
  git -C "$ROOT" merge-base --is-ancestor "$old" "$candidate" || die 'candidate does not preserve old main ancestry'
  git -C "$ROOT" merge-base --is-ancestor "$upstream" "$candidate" || die 'candidate does not contain upstream history'
fi

check_operation_state
check_clean || die 'working tree became dirty before main update; backup retained'
current=$(git -C "$ROOT" rev-parse --verify "$MAIN_REF^{commit}") || die 'main disappeared before compare-and-swap'
[[ "$current" == "$old" ]] || die "concurrent main update detected (expected $old, found $current); backup retained at $backup"
[[ "$(git -C "$ROOT" rev-parse --verify "$backup")" == "$old" ]] || die "backup readback changed before update: $backup"
if ! git -C "$ROOT" -c core.fsync=reference -c core.fsyncMethod=fsync update-ref -m "sync-upstream: $mode" "$MAIN_REF" "$candidate" "$old"; then
  die "main compare-and-swap failed; main was not overwritten, backup retained at $backup"
fi
if ! git -C "$ROOT" read-tree -u -m "$old" "$candidate"; then
  die "main advanced to $candidate but checkout update failed; backup retained at $backup; checkout needs manual recovery"
fi
log "updated main ($mode) from $old to $candidate; backup retained at $backup; no push performed"
