#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
SYNC_SCRIPT="$SCRIPT_DIR/sync-upstream.sh"
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/sync-upstream-test.XXXXXX")
trap 'rm -rf -- "$TMP_ROOT"' EXIT

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$*"; }
assert_eq() { [[ "$1" == "$2" ]] || fail "$3 (expected '$2', got '$1')"; }
common_dir() {
  local path
  path=$(git -C "$WORK" rev-parse --git-common-dir)
  [[ "$path" = /* ]] || path="$WORK/$path"
  (cd -- "$path" && pwd -P)
}
assert_rejected() {
  local label=$1 log=$2
  if (cd "$WORK" && SYNC_UPSTREAM_ROOT="$WORK" SYNC_UPSTREAM_FIXTURE=1 "$SYNC_SCRIPT") >"$log" 2>&1; then
    fail "$label unexpectedly succeeded"
  fi
  [[ -s "$log" ]] || fail "$label failed without a diagnostic"
}
init_fixture() {
  local name=$1
  FIX="$TMP_ROOT/$name"
  mkdir -p "$FIX"
  git init --bare -q "$FIX/upstream.git"
  git init --bare -q "$FIX/origin.git"
  git init -q "$FIX/seed"
  git -C "$FIX/seed" config user.name Fixture
  git -C "$FIX/seed" config user.email fixture@example.invalid
  printf 'base\n' > "$FIX/seed/file.txt"
  git -C "$FIX/seed" add file.txt
  git -C "$FIX/seed" commit -qm base
  git -C "$FIX/seed" branch -M main
  git -C "$FIX/seed" remote add upstream "$FIX/upstream.git"
  git -C "$FIX/seed" remote add origin "$FIX/origin.git"
  git -C "$FIX/seed" push -q upstream main
  git -C "$FIX/seed" push -q origin main
  git --git-dir="$FIX/upstream.git" symbolic-ref HEAD refs/heads/main
  git --git-dir="$FIX/origin.git" symbolic-ref HEAD refs/heads/main
  git clone -q "$FIX/upstream.git" "$FIX/work"
  WORK="$FIX/work"
  git -C "$WORK" config user.name Fixture
  git -C "$WORK" config user.email fixture@example.invalid
  git -C "$WORK" remote rename origin upstream
  git -C "$WORK" remote add origin "$FIX/origin.git"
  git -C "$WORK" checkout -q -B main
}
commit_file() {
  local path=$1 text=$2 message=$3
  printf '%s\n' "$text" > "$WORK/$path"
  git -C "$WORK" add "$path"
  git -C "$WORK" commit -qm "$message"
}
advance_upstream() {
  local path=$1 text=$2 message=$3
  printf '%s\n' "$text" > "$FIX/seed/$path"
  git -C "$FIX/seed" add "$path"
  git -C "$FIX/seed" commit -qm "$message"
  git -C "$FIX/seed" push -q upstream main
}
run_sync() {
  (cd "$WORK" && SYNC_UPSTREAM_ROOT="$WORK" SYNC_UPSTREAM_FIXTURE=1 "$SYNC_SCRIPT")
}
backup_refs() { git -C "$WORK" for-each-ref --format='%(refname)' 'refs/heads/backup/upstream-sync-*'; }

[[ -x "$SYNC_SCRIPT" ]] || fail "canonical script missing or not executable"

init_fixture identity
old=$(git -C "$WORK" rev-parse main)
git -C "$WORK" checkout -qb not-main
assert_rejected "wrong branch" "$FIX/wrong-branch.log"
assert_eq "$(git -C "$WORK" rev-parse main)" "$old" "wrong branch moved main"
git -C "$WORK" checkout -q main
git -C "$WORK" remote remove upstream
assert_rejected "missing upstream remote" "$FIX/missing-upstream.log"
assert_eq "$(git -C "$WORK" rev-parse main)" "$old" "missing upstream moved main"
[[ -z "$(backup_refs)" ]] || fail "identity refusal created backup"
pass "wrong branch and missing upstream are refused"

init_fixture equal
old=$(git -C "$WORK" rev-parse main)
origin_old=$(git --git-dir="$FIX/origin.git" rev-parse refs/heads/main)
run_sync >/dev/null
assert_eq "$(git -C "$WORK" rev-parse main)" "$old" "equal tips moved main"
[[ -z "$(backup_refs)" ]] || fail "equal tips created backup"
pass "equal tips are a no-op"

init_fixture ahead
commit_file local.txt local-only local-change
old=$(git -C "$WORK" rev-parse main)
run_sync >/dev/null
assert_eq "$(git -C "$WORK" rev-parse main)" "$old" "ahead-only main was rewritten"
[[ -z "$(backup_refs)" ]] || fail "ahead-only tips created backup"
pass "local-ahead-only main keeps commits without rewrite"

init_fixture behind
advance_upstream upstream.txt upstream upstream-change
old=$(git -C "$WORK" rev-parse main)
origin_old=$(git --git-dir="$FIX/origin.git" rev-parse refs/heads/main)
run_sync >/dev/null
new=$(git -C "$WORK" rev-parse main)
[[ "$new" != "$old" ]] || fail "behind local main did not advance"
backup=$(backup_refs)
[[ -n "$backup" ]] || fail "fast-forward omitted backup"
assert_eq "$(git -C "$WORK" rev-parse "$backup")" "$old" "backup is not exact old main"
assert_eq "$(git --git-dir="$FIX/origin.git" rev-parse refs/heads/main)" "$origin_old" "script pushed to origin"
old_backups=$(backup_refs)
run_sync >/dev/null
assert_eq "$(backup_refs)" "$old_backups" "equal repeat removed or added backup refs"
pass "fast-forward retains exact pre-update main backup and does not push"

init_fixture diverged
commit_file local.txt local-only local-change
local_commit=$(git -C "$WORK" rev-parse main)
advance_upstream upstream.txt upstream upstream-change
old=$local_commit
run_sync >/dev/null
new=$(git -C "$WORK" rev-parse main)
backup=$(backup_refs)
assert_eq "$(git -C "$WORK" rev-parse "$backup")" "$old" "divergence backup mismatch"
git -C "$WORK" merge-base --is-ancestor "$local_commit" "$new" || fail "original local commit not retained"
git -C "$WORK" merge-base --is-ancestor "$(git -C "$WORK" rev-parse upstream/main)" "$new" || fail "upstream history not retained"
[[ -f "$WORK/local.txt" && -f "$WORK/upstream.txt" ]] || fail "diverged content incomplete"
pass "diverged history preserves local ancestry and upstream content"

init_fixture conflict
commit_file shared.txt local local-shared
local_commit=$(git -C "$WORK" rev-parse main)
advance_upstream shared.txt upstream upstream-conflict
assert_rejected conflict "$FIX/conflict.log"
assert_eq "$(git -C "$WORK" rev-parse main)" "$local_commit" "conflict moved main"
backup=$(backup_refs)
[[ -n "$backup" ]] || fail "conflict did not leave recoverable backup"
assert_eq "$(git -C "$WORK" rev-parse "$backup")" "$local_commit" "conflict backup mismatch"
[[ ! -e "$(git -C "$WORK" rev-parse --absolute-git-dir)/rebase-merge" && ! -e "$(git -C "$WORK" rev-parse --absolute-git-dir)/rebase-apply" ]] || fail "temporary rebase state leaked"
pass "conflict leaves main and backup intact, without rebase residue"

for dirt in staged unstaged untracked; do
  init_fixture "dirty-$dirt"
  advance_upstream upstream.txt new-upstream upstream-change
  old_tracking=$(git -C "$WORK" rev-parse refs/remotes/upstream/main)
  case "$dirt" in
    staged) printf x > "$WORK/file.txt"; git -C "$WORK" add file.txt ;;
    unstaged) printf x >> "$WORK/file.txt" ;;
    untracked) printf x > "$WORK/untracked.txt" ;;
  esac
  old=$(git -C "$WORK" rev-parse main)
  assert_rejected "dirty $dirt tree" "$FIX/$dirt.log"
  assert_eq "$(git -C "$WORK" rev-parse main)" "$old" "dirty $dirt moved main"
  assert_eq "$(git -C "$WORK" rev-parse refs/remotes/upstream/main)" "$old_tracking" "dirty $dirt fetched before refusal"
  [[ -z "$(backup_refs)" ]] || fail "dirty $dirt created backup"
done
pass "staged, unstaged, and untracked changes are refused before fetch"

init_fixture operation
mkdir -p "$(git -C "$WORK" rev-parse --absolute-git-dir)/rebase-merge"
assert_rejected "preexisting rebase" "$FIX/rebase.log"
rmdir "$(git -C "$WORK" rev-parse --absolute-git-dir)/rebase-merge"
mkdir -p "$FIX/wrapper"
real_git=$(command -v git)
cat > "$FIX/wrapper/git" <<'SH'
#!/usr/bin/env bash
set -e
if [[ " $* " == *" fetch "* && ! -e "$LOCK_MARKER" ]]; then
  : > "$LOCK_MARKER"
  sleep 1
fi
exec "$REAL_GIT" "$@"
SH
chmod +x "$FIX/wrapper/git"
(cd "$WORK" && PATH="$FIX/wrapper:$PATH" REAL_GIT="$real_git" LOCK_MARKER="$FIX/lock-held" SYNC_UPSTREAM_ROOT="$WORK" SYNC_UPSTREAM_FIXTURE=1 "$SYNC_SCRIPT") >"$FIX/first.log" 2>&1 &
first_pid=$!
for _ in {1..100}; do
  [[ -e "$FIX/lock-held" ]] && break
  sleep 0.02
done
[[ -e "$FIX/lock-held" ]] || fail "first invocation never reached fetch"
assert_rejected "overlapping invocation" "$FIX/second.log"
wait "$first_pid" || fail "first lock-holder invocation failed"
pass "preexisting operation is refused and overlapping invocation is locked"

init_fixture fetch-failure
git -C "$WORK" remote set-url upstream "$FIX/missing.git"
old=$(git -C "$WORK" rev-parse main)
assert_rejected "fetch failure" "$FIX/fetch.log"
assert_eq "$(git -C "$WORK" rev-parse main)" "$old" "fetch failure moved main"
[[ -z "$(backup_refs)" ]] || fail "fetch failure created backup"
pass "fetch failure leaves main and backup refs untouched"

init_fixture collision
old=$(git -C "$WORK" rev-parse main)
advance_upstream upstream.txt new-upstream upstream-change
collision=$(git -C "$WORK" commit-tree "$(git -C "$WORK" rev-parse main^{tree})" -p "$old" -m collision-target)
git -C "$WORK" update-ref refs/heads/backup/upstream-sync-fixed-0 "$collision" "$(printf '%*s' "${#old}" '' | tr ' ' 0)"
SYNC_UPSTREAM_TEST_STAMP=fixed run_sync >/dev/null
assert_eq "$(git -C "$WORK" rev-parse refs/heads/backup/upstream-sync-fixed-0)" "$collision" "backup collision was overwritten"
assert_eq "$(git -C "$WORK" rev-parse refs/heads/backup/upstream-sync-fixed-1)" "$old" "collision retry backup mismatch"
pass "backup collision retries with create-only refs"

init_fixture race
commit_file local.txt local local-change
old=$(git -C "$WORK" rev-parse main)
advance_upstream upstream.txt upstream upstream-change
race_oid=$(git -C "$WORK" commit-tree "$(git -C "$WORK" rev-parse main^{tree})" -p "$old" -m concurrent-writer)
mkdir -p "$FIX/wrapper"
real_git=$(command -v git)
cat > "$FIX/wrapper/git" <<'SH'
#!/usr/bin/env bash
set -e
if [[ " $* " == *" update-ref "*" refs/heads/main "* && ! -e "$RACE_MARKER" ]]; then
  : > "$RACE_MARKER"
  "$REAL_GIT" -C "$RACE_ROOT" update-ref refs/heads/main "$RACE_OID" "$EXPECTED_OID"
fi
exec "$REAL_GIT" "$@"
SH
chmod +x "$FIX/wrapper/git"
if (cd "$WORK" && PATH="$FIX/wrapper:$PATH" REAL_GIT="$real_git" RACE_ROOT="$WORK" RACE_OID="$race_oid" EXPECTED_OID="$old" RACE_MARKER="$FIX/raced" SYNC_UPSTREAM_ROOT="$WORK" SYNC_UPSTREAM_FIXTURE=1 SYNC_UPSTREAM_TEST_STAMP=race "$SYNC_SCRIPT") >"$FIX/race.log" 2>&1; then
  fail "stale-ref compare-and-swap unexpectedly succeeded"
fi
[[ -e "$FIX/raced" ]] || fail "race wrapper did not exercise the CAS boundary"
assert_eq "$(git -C "$WORK" rev-parse main)" "$race_oid" "script overwrote concurrent main update"
assert_eq "$(git -C "$WORK" rev-parse refs/heads/backup/upstream-sync-race-0)" "$old" "race did not retain old main backup"
pass "concurrent main writer wins and stale script CAS fails closed"

init_fixture direct-main
old=$(git -C "$WORK" rev-parse main)
new=$(git -C "$WORK" commit-tree "$(git -C "$WORK" rev-parse main^{tree})" -p "$old" -m direct-ref-update)
git -C "$WORK" update-ref refs/heads/main "$new" "$old"
assert_eq "$(git -C "$WORK" rev-parse main)" "$new" "negative direct-ref fixture failed"
[[ -z "$(backup_refs)" ]] || fail "direct ref update unexpectedly ran the sync backup"
pass "direct main ref update bypasses this script; CONV-04 gate remains separate"

printf 'All sync-upstream fixtures passed.\n'
