#!/bin/sh
# RUS-1507: converge the root checkout without ever writing a remote.
set -eu

live_root=/Users/t/Projects/CTN
fixture=0
case "$#" in
    0) root=$live_root ;;
    2)
        if [ "$1" != --fixture-root ] || [ "${SYNC_UPSTREAM_FIXTURE:-}" != 1 ]; then
            echo 'sync-upstream: fixture mode requires explicit test opt-in' >&2
            exit 1
        fi
        root=$2
        fixture=1
        ;;
    *) echo 'sync-upstream: unexpected arguments' >&2; exit 1 ;;
esac

fail() { printf 'sync-upstream: %s\n' "$*" >&2; exit 1; }
[ -d "$root" ] || fail "checkout does not exist: $root"
root=$(cd "$root" && pwd -P) || fail 'cannot resolve checkout'
[ "$fixture" -eq 0 ] || [ "$root" != "$live_root" ] || fail 'fixture mode cannot target live CTN'
[ "$fixture" -eq 1 ] || [ "$root" = "$live_root" ] || fail 'unexpected production checkout'
for variable in GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR GIT_INDEX_FILE GIT_NAMESPACE; do
    eval 'present=${'"$variable"'+yes}'
    [ "${present:-}" != yes ] || fail "refusing inherited $variable"
done
[ "$(git -C "$root" rev-parse --is-inside-work-tree 2>/dev/null)" = true ] || fail 'not a Git worktree'
[ "$(cd "$(git -C "$root" rev-parse --show-toplevel)" && pwd -P)" = "$root" ] || fail 'checkout is not the repository root'
[ "$(git -C "$root" rev-parse --is-shallow-repository)" = false ] || fail 'shallow history cannot be rebased safely'

common=$(git -C "$root" rev-parse --git-common-dir)
case "$common" in /*) ;; *) common=$root/$common ;; esac
common=$(cd "$common" && pwd -P) || fail 'cannot resolve Git common directory'
[ -z "$(git -C "$root" config --get core.hooksPath || :)" ] || fail 'custom hooksPath prevents verification of the main gate'
gate=$root/tooling/scripts/ctn_main_ref_gate.py
hook=$common/hooks/reference-transaction
[ -f "$gate" ] && [ -x "$hook" ] && cmp -s "$gate" "$hook" || fail 'effective reference-transaction hook does not match the tracked main gate'

lock=$common/sync-upstream.lock
mkdir "$lock" 2>/dev/null || fail "another sync or stale lock is present: $lock"
candidate_dir=
candidate_registered=0
fetch_ref=
cleanup() {
    result=$?
    trap - 0 HUP INT TERM
    if [ -n "$candidate_dir" ]; then
        if [ "$candidate_registered" -eq 1 ]; then
            git -C "$root" worktree remove --force "$candidate_dir" >&2 ||
                printf 'sync-upstream: inspect temporary worktree: %s\n' "$candidate_dir" >&2
        else
            rmdir "$candidate_dir" 2>/dev/null ||
                printf 'sync-upstream: inspect temporary directory: %s\n' "$candidate_dir" >&2
        fi
    fi
    if [ -n "$fetch_ref" ] && git -C "$root" show-ref --verify --quiet "$fetch_ref"; then
        git -C "$root" update-ref -d "$fetch_ref" ||
            printf 'sync-upstream: inspect temporary fetched ref: %s\n' "$fetch_ref" >&2
    fi
    rmdir "$lock" || printf 'sync-upstream: remove stale lock after inspection: %s\n' "$lock" >&2
    exit "$result"
}
trap cleanup 0
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

check_root() {
    [ "$(git -C "$root" symbolic-ref -q HEAD 2>/dev/null)" = refs/heads/main ] || fail 'root checkout must be on main'
    for operation in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD REBASE_HEAD BISECT_LOG MERGE_AUTOSTASH rebase-merge rebase-apply sequencer; do
        path=$(git -C "$root" rev-parse --git-path "$operation")
        case "$path" in /*) ;; *) path=$root/$path ;; esac
        [ ! -e "$path" ] || fail "Git operation in progress: $operation"
    done
    [ -z "$(git -C "$root" ls-files -u)" ] || fail 'unmerged index entries'
    [ -z "$(git -C "$root" status --porcelain=v1 --untracked-files=all)" ] || fail 'dirty root checkout (staged, unstaged or untracked)'
}
check_root # Absolutely no fetch (or index mutation) on an unsafe checkout.
old=$(git -C "$root" rev-parse --verify 'refs/heads/main^{commit}') || fail 'main is missing'
url=$(git -C "$root" remote get-url upstream) || fail 'configured upstream is missing'
if [ "$fixture" -eq 0 ]; then
    [ "$url" = https://github.com/macro-inc/macro.git ] || fail "unexpected upstream fetch URL: $url"
else
    case "$url" in /*|file:///*) ;; *) fail 'fixtures may fetch only a local upstream' ;; esac
fi
previous=$(git -C "$root" rev-parse --verify 'refs/remotes/upstream/main^{commit}' 2>/dev/null || :)
zero=$(printf '%040d' 0)
case ${#old} in 64) zero=$(printf '%064d' 0) ;; 40) ;; *) fail 'unsupported object ID length' ;; esac
fetch_ref=refs/fusion-sync-fetch/$(date -u +%Y%m%dT%H%M%SZ)-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')
git -C "$root" show-ref --verify --quiet "$fetch_ref" && fail "temporary fetched ref collision: $fetch_ref"
# Fetch into a one-use ref so a rejected remote rewind cannot poison the
# retained upstream/main checkpoint that the next invocation must compare.
git -C "$root" fetch --no-tags --no-prune --no-recurse-submodules "$url" \
    "+refs/heads/main:$fetch_ref" || fail "upstream fetch failed; main remains $old"
check_root
[ "$(git -C "$root" rev-parse --verify refs/heads/main)" = "$old" ] || fail "main changed during fetch; old=$old"
upstream=$(git -C "$root" rev-parse --verify "$fetch_ref^{commit}") || fail 'fetched upstream/main is missing'
if [ -n "$previous" ] && ! git -C "$root" merge-base --is-ancestor "$previous" "$upstream"; then
    fail "upstream/main rewound; old=$old previous=$previous fetched=$upstream"
fi
git -C "$root" -c core.fsync=reference -c core.fsyncMethod=fsync \
    update-ref refs/remotes/upstream/main "$upstream" "${previous:-$zero}" ||
    fail "upstream tracking ref changed concurrently; main remains $old"
if [ "$old" = "$upstream" ]; then
    printf 'sync-upstream: equal; main=%s (no rewrite)\n' "$old"
    exit 0
fi
if git -C "$root" merge-base --is-ancestor "$upstream" "$old"; then
    printf 'sync-upstream: local main ahead; main=%s upstream=%s (no rewrite)\n' "$old" "$upstream"
    exit 0
fi

# Backup is created and verified before any candidate worktree/rebase is made.
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup=
attempt=0
while [ "$attempt" -lt 8 ]; do
    attempt=$((attempt + 1))
    nonce=$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')
    name=$stamp-$nonce
    if [ "$fixture" -eq 1 ] && [ "$attempt" -eq 1 ] && [ -n "${SYNC_UPSTREAM_FIXTURE_BACKUP_NAME:-}" ]; then
        name=$SYNC_UPSTREAM_FIXTURE_BACKUP_NAME
    fi
    case "$name" in *[!a-zA-Z0-9_-]*|'') fail 'invalid backup name' ;; esac
    backup=refs/heads/backup/upstream-sync-$name
    if git -C "$root" -c core.fsync=reference -c core.fsyncMethod=fsync \
        update-ref "$backup" "$old" "$zero" 2>/dev/null; then
        break
    fi
    git -C "$root" show-ref --verify --quiet "$backup" || fail "cannot create backup $backup; main=$old"
    backup=
done
[ -n "$backup" ] || fail "all unique backup attempts collided; main=$old"
[ "$(git -C "$root" rev-parse --verify "$backup")" = "$old" ] || fail "backup readback mismatch; main=$old backup=$backup"
[ "$(git -C "$root" rev-parse --verify refs/heads/main)" = "$old" ] || fail "main changed after backup; old=$old backup=$backup"
# The installed hook's separate pre-merge reservation is also made before the candidate.
reservation=$(cd "$root" && python3 "$gate" reserve "$old") || fail "main gate reservation failed; old=$old backup=$backup"
[ "$(git -C "$root" rev-parse --verify "$reservation")" = "$old" ] || fail "gate reservation readback mismatch; backup=$backup"
printf 'sync-upstream: retained exact old=%s backup=%s gate=%s\n' "$old" "$backup" "$reservation"
if [ "$fixture" -eq 1 ] && [ -n "${SYNC_UPSTREAM_FIXTURE_AFTER_BACKUP:-}" ]; then
    "$SYNC_UPSTREAM_FIXTURE_AFTER_BACKUP" "$root" "$old" "$backup" || fail 'fixture backup checkpoint failed'
fi

if git -C "$root" merge-base --is-ancestor "$old" "$upstream"; then
    candidate=$upstream
    mode=behind
else
    bases=$(git -C "$root" merge-base --all "$old" "$upstream") || fail "no merge base; backup=$backup"
    [ "$(printf '%s\n' "$bases" | wc -l | tr -d ' ')" = 1 ] || fail "multiple merge bases; backup=$backup"
    candidate_dir=$(mktemp -d "${TMPDIR:-/tmp}/ctn-sync-candidate.XXXXXXXX") || fail "cannot create candidate directory; backup=$backup"
    git -C "$root" worktree add --detach "$candidate_dir" "$old" || fail "cannot create candidate worktree; backup=$backup"
    candidate_registered=1
    git -C "$candidate_dir" rebase --rebase-merges --onto "$upstream" "$bases" ||
        fail "rebase conflict; main=$old upstream=$upstream backup=$backup (root unchanged)"
    rebased=$(git -C "$candidate_dir" rev-parse --verify 'HEAD^{commit}') || fail "missing rebased tip; backup=$backup"
    git -C "$root" merge-base --is-ancestor "$upstream" "$rebased" || fail "rebased tip lost upstream; backup=$backup"
    tree=$(git -C "$candidate_dir" rev-parse --verify 'HEAD^{tree}') || fail "missing rebased tree; backup=$backup"
    # A rebase discards old ancestry. This tree-identical merge proves provenance to
    # the installed old-ancestor gate; it does not resolve conflicts or change content.
    candidate=$(printf 'RUS-1507: retain pre-sync main provenance\n' |
        git -C "$candidate_dir" commit-tree "$tree" -p "$rebased" -p "$old") || fail "provenance bridge failed; backup=$backup"
    [ "$(git -C "$root" rev-parse "$candidate^{tree}")" = "$tree" ] || fail "bridge changed rebased tree; backup=$backup"
    mode=divergent
fi

git -C "$root" merge-base --is-ancestor "$old" "$candidate" || fail "candidate fails old-ancestor gate; backup=$backup"
git -C "$root" merge-base --is-ancestor "$upstream" "$candidate" || fail "candidate lost upstream history; backup=$backup"
check_root
[ "$(git -C "$root" rev-parse --verify refs/heads/main)" = "$old" ] || fail "main changed before CAS; old=$old backup=$backup"
[ "$(git -C "$root" rev-parse --verify refs/remotes/upstream/main)" = "$upstream" ] || fail "upstream tracking ref changed; backup=$backup"
if [ "$fixture" -eq 1 ] && [ -n "${SYNC_UPSTREAM_FIXTURE_BEFORE_CAS:-}" ]; then
    "$SYNC_UPSTREAM_FIXTURE_BEFORE_CAS" "$root" "$old" "$backup" || fail 'fixture CAS checkpoint failed'
fi
check_root
[ "$(git -C "$root" rev-parse --verify refs/heads/main)" = "$old" ] || fail "stale main; old=$old backup=$backup"
# Git checks old atomically while the installed hook verifies the reserved backup.
CTN_MAIN_RESERVATION_REF=$reservation git -C "$root" -c core.fsync=reference \
    -c core.fsyncMethod=fsync update-ref refs/heads/main "$candidate" "$old" ||
    fail "main CAS refused; old=$old candidate=$candidate backup=$backup"
# The index/worktree still describe old after update-ref; two-tree checkout refuses
# to overwrite late local edits instead of destructively resetting them.
git -C "$root" read-tree -m -u "$old" "$candidate" ||
    fail "main advanced to $candidate but checkout refused; recover from backup=$backup without reset"
[ -z "$(git -C "$root" status --porcelain=v1 --untracked-files=all)" ] ||
    fail "main advanced to $candidate but checkout became dirty; backup=$backup"
printf 'sync-upstream: %s old=%s new=%s upstream=%s backup=%s gate=%s\n' \
    "$mode" "$old" "$candidate" "$upstream" "$backup" "$reservation"
