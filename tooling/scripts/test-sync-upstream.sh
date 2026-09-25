#!/bin/sh
# RUS-1507 disposable, offline integration fixtures; never invoke against live CTN.
set -eu

script=$(cd "$(dirname "$0")" && pwd -P)/sync-upstream.sh
gate=$(cd "$(dirname "$0")" && pwd -P)/ctn_main_ref_gate.py
[ -f "$gate" ] || { echo 'missing tracked main gate' >&2; exit 1; }
base=$(mktemp -d "${TMPDIR:-/tmp}/rus-1507-fixtures.XXXXXXXX")
trap 'rm -rf "$base"' 0
trap 'exit 130' INT
trap 'exit 143' TERM

fail() { printf 'fixture failure: %s\n' "$*" >&2; exit 1; }
equal() { [ "$1" = "$2" ] || fail "$3 (expected=$2 actual=$1)"; }
ref() { git -C "$repo" rev-parse --verify "$1"; }
backup_lines() {
    git -C "$repo" for-each-ref --format='%(refname) %(objectname)' refs/heads/backup |
        while read -r name object; do
            case "$name" in
                refs/heads/backup/upstream-sync-*) printf '%s %s\n' "$name" "$object" ;;
            esac
        done
}
pre_merge_lines() {
    git -C "$repo" for-each-ref --format='%(refname)' refs/heads/backup |
        while read -r name; do
            case "$name" in
                refs/heads/backup/pre-merge-*) printf '%s\n' "$name" ;;
            esac
        done
}
backup_count() { backup_lines | wc -l | tr -d ' '; }
assert_backup_for() {
    expected=$1
    found=0
    while read -r name object; do
        [ "$object" != "$expected" ] || found=$((found + 1))
    done <<EOF
$(backup_lines)
EOF
    [ "$found" -gt 0 ] || fail "no upstream-sync backup for $expected"
}
assert_remotes_unchanged() {
    equal "$(git --git-dir "$origin" rev-parse refs/heads/main)" "$origin_oid" 'origin was pushed'
    equal "$(git --git-dir "$upstream_git" rev-parse refs/heads/main)" "$upstream_oid" 'upstream was pushed'
}
remember_remotes() {
    origin_oid=$(git --git-dir "$origin" rev-parse refs/heads/main)
    upstream_oid=$(git --git-dir "$upstream_git" rev-parse refs/heads/main)
}
setup() {
    label=$1
    case_dir=$base/$label
    mkdir -p "$case_dir"
    upstream_git=$case_dir/upstream.git
    origin=$case_dir/origin.git
    seed=$case_dir/seed
    repo=$case_dir/local
    git init -q --bare "$upstream_git"
    git init -q --bare "$origin"
    git init -q -b main "$seed"
    git -C "$seed" config user.name 'Fixture Author'
    git -C "$seed" config user.email 'fixture@example.invalid'
    mkdir -p "$seed/tooling/scripts"
    cp "$gate" "$seed/tooling/scripts/ctn_main_ref_gate.py"
    printf 'base\n' > "$seed/shared.txt"
    git -C "$seed" add .
    git -C "$seed" commit -qm 'seed'
    git -C "$seed" remote add upstream "$upstream_git"
    git -C "$seed" remote add origin "$origin"
    git -C "$seed" push -q upstream main
    git -C "$seed" push -q origin main
    git clone -q -b main "$origin" "$repo"
    git -C "$repo" config user.name 'Fixture Author'
    git -C "$repo" config user.email 'fixture@example.invalid'
    git -C "$repo" remote add upstream "$upstream_git"
    cp "$gate" "$repo/.git/hooks/reference-transaction"
    chmod +x "$repo/.git/hooks/reference-transaction"
    initial=$(ref refs/heads/main)
    remember_remotes
    log=$case_dir/sync.log
}
run_sync() {
    if env SYNC_UPSTREAM_FIXTURE=1 "$@" "$script" --fixture-root "$repo" > "$log" 2>&1; then
        result=0
    else
        result=$?
    fi
}
assert_success() { [ "$result" -eq 0 ] || fail "sync should succeed ($case_dir): $(cat "$log")"; }
assert_failure() { [ "$result" -ne 0 ] || fail "sync should refuse ($case_dir)"; }
advance_upstream() {
    file=$1
    value=$2
    printf '%s\n' "$value" > "$seed/$file"
    git -C "$seed" add "$file"
    git -C "$seed" commit -qm "upstream $value"
    git -C "$seed" push -q upstream main
    remember_remotes
}

setup equal
run_sync
assert_success
equal "$(ref refs/heads/main)" "$initial" 'equal main rewrote'
equal "$(backup_count)" 0 'equal main created a backup'
assert_remotes_unchanged

setup ahead
printf 'local\n' > "$repo/local.txt"
git -C "$repo" add local.txt
git -C "$repo" commit -qm 'local only'
ahead=$(ref refs/heads/main)
run_sync
assert_success
equal "$(ref refs/heads/main)" "$ahead" 'ahead main rewrote'
equal "$(backup_count)" 0 'ahead main created a backup'
assert_remotes_unchanged

setup behind
advance_upstream upstream.txt remote
checkpoint=$case_dir/checkpoint
cat > "$checkpoint" <<'SH'
#!/bin/sh
[ "$(git -C "$1" rev-parse --verify "$3")" = "$2" ] || exit 1
[ "$(git -C "$1" rev-parse --verify refs/heads/main)" = "$2" ] || exit 1
[ "$(git -C "$1" worktree list --porcelain | sed -n '/^worktree /p' | wc -l | tr -d ' ')" = 1 ] || exit 1
printf '%s\n' "$3" > "$1/.git/backup-observed"
SH
chmod +x "$checkpoint"
run_sync SYNC_UPSTREAM_FIXTURE_AFTER_BACKUP="$checkpoint"
assert_success
equal "$(ref refs/heads/main)" "$upstream_oid" 'behind did not fast-forward'
assert_backup_for "$initial"
[ -f "$repo/.git/backup-observed" ] || fail 'backup not observed before candidate construction'
equal "$(cat "$repo/upstream.txt")" remote 'upstream content absent'
assert_remotes_unchanged
saved=$(backup_lines)
run_sync
assert_success
equal "$(backup_lines)" "$saved" 'repeat changed retained backups'
assert_remotes_unchanged

setup divergent
advance_upstream remote.txt remote
printf 'local\n' > "$repo/local.txt"
git -C "$repo" add local.txt
git -C "$repo" commit -qm 'local work'
old=$(ref refs/heads/main)
run_sync
assert_success
new=$(ref refs/heads/main)
[ "$new" != "$old" ] || fail 'divergence did not advance main'
assert_backup_for "$old"
equal "$(git -C "$repo" rev-parse "$new^2")" "$old" 'bridge lost exact original second parent'
git -C "$repo" merge-base --is-ancestor "$upstream_oid" "$new" || fail 'upstream history absent'
git -C "$repo" merge-base --is-ancestor "$old" "$new" || fail 'old history absent'
equal "$(git -C "$repo" rev-parse "$new^{tree}")" "$(git -C "$repo" rev-parse "$new^1^{tree}")" 'bridge changed rebased content'
equal "$(cat "$repo/local.txt")" local 'local content absent'
equal "$(cat "$repo/remote.txt")" remote 'upstream content absent'
assert_remotes_unchanged

for state in staged unstaged untracked; do
    setup "dirty-$state"
    case "$state" in
        staged) printf 'staged\n' > "$repo/shared.txt"; git -C "$repo" add shared.txt ;;
        unstaged) printf 'unstaged\n' > "$repo/shared.txt" ;;
        untracked) printf 'untracked\n' > "$repo/stray.txt" ;;
    esac
    run_sync
    assert_failure
    equal "$(ref refs/heads/main)" "$initial" "dirty $state moved main"
    equal "$(backup_count)" 0 "dirty $state made a backup"
    assert_remotes_unchanged
done

setup in-progress
mkdir "$repo/.git/rebase-merge"
run_sync
assert_failure
equal "$(ref refs/heads/main)" "$initial" 'in-progress main moved'
equal "$(backup_count)" 0 'in-progress operation made backup'
assert_remotes_unchanged

setup fetch-error
git -C "$repo" remote set-url upstream "$case_dir/missing-upstream.git"
run_sync
assert_failure
equal "$(ref refs/heads/main)" "$initial" 'failed fetch moved main'
equal "$(backup_count)" 0 'failed fetch made backup'
assert_remotes_unchanged

setup rewind
advance_upstream remote.txt first
git -C "$repo" fetch -q upstream '+refs/heads/main:refs/remotes/upstream/main'
tracked=$(ref refs/remotes/upstream/main)
git -C "$seed" switch -q -c rewritten "$initial"
printf 'rewritten\n' > "$seed/remote.txt"
git -C "$seed" add remote.txt
git -C "$seed" commit -qm 'rewritten upstream'
git -C "$seed" push -q --force upstream HEAD:main
remember_remotes
run_sync
assert_failure
equal "$(ref refs/remotes/upstream/main)" "$tracked" 'rewind poisoned tracking history'
equal "$(ref refs/heads/main)" "$initial" 'rewind moved main'
run_sync
assert_failure
equal "$(ref refs/remotes/upstream/main)" "$tracked" 'second rewind changed tracking history'
equal "$(ref refs/heads/main)" "$initial" 'second rewind moved main'
assert_remotes_unchanged

setup lock
mkdir "$repo/.git/sync-upstream.lock"
run_sync
assert_failure
equal "$(ref refs/heads/main)" "$initial" 'contended lock moved main'
equal "$(backup_count)" 0 'contended lock made backup'
assert_remotes_unchanged

setup collision
advance_upstream upstream.txt remote
git -C "$repo" update-ref refs/heads/backup/upstream-sync-collision "$initial"
run_sync SYNC_UPSTREAM_FIXTURE_BACKUP_NAME=collision
assert_success
equal "$(ref refs/heads/backup/upstream-sync-collision)" "$initial" 'collided backup was overwritten'
equal "$(backup_count)" 2 'collision did not create distinct backup'
assert_backup_for "$initial"
assert_remotes_unchanged

setup conflict
advance_upstream shared.txt upstream
printf 'local\n' > "$repo/shared.txt"
git -C "$repo" add shared.txt
git -C "$repo" commit -qm 'conflicting local edit'
old=$(ref refs/heads/main)
run_sync
assert_failure
equal "$(ref refs/heads/main)" "$old" 'conflict moved main'
assert_backup_for "$old"
equal "$(cat "$repo/shared.txt")" local 'conflict overwrote local checkout'
assert_remotes_unchanged

setup race
advance_upstream remote.txt remote
race_hook=$case_dir/race
cat > "$race_hook" <<'SH'
#!/bin/sh
git -C "$1" commit --allow-empty -qm 'concurrent main writer'
SH
chmod +x "$race_hook"
old=$(ref refs/heads/main)
run_sync SYNC_UPSTREAM_FIXTURE_BEFORE_CAS="$race_hook"
assert_failure
raced=$(ref refs/heads/main)
[ "$raced" != "$old" ] || fail 'race callback did not move main'
assert_backup_for "$old"
equal "$(git -C "$repo" rev-parse "$raced^{tree}")" "$(git -C "$repo" rev-parse "$old^{tree}")" 'race unexpectedly changed content'
assert_remotes_unchanged

setup direct-main-isolation
git -C "$repo" commit --allow-empty -qm 'direct main writer'
[ "$(ref refs/heads/main)" != "$initial" ] || fail 'direct main writer did not run'
equal "$(backup_count)" 0 'direct main write invoked sync backup unexpectedly'
[ -n "$(pre_merge_lines)" ] ||
    fail 'installed separate direct-main gate did not retain its own backup'
assert_remotes_unchanged

printf 'RUS-1507 offline fixtures passed; all repositories disposable\n'
