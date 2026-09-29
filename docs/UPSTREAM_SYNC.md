# Upstream synchronization runbook

## Scope and invariant

The tracked implementation is `tooling/scripts/sync-upstream.sh`. Its production target is exactly `/Users/t/Projects/CTN`, checked out on local `main`, with an existing `upstream` remote. It fetches only `upstream`'s `refs/heads/main` into `refs/remotes/upstream/main`; it does not add or rewrite remotes, prune refs, fetch tags, push, reset, or update any branch other than local `main`.

Before fetching, the script rejects staged, unstaged, and untracked changes and any merge, rebase, cherry-pick, revert, sequencer, or bisect state. It refuses if another invocation holds the shared Git-directory lock at `sync-upstream.lock`. A stale lock is deliberately fail-closed: first confirm no sync process is active, then remove the lock directory manually. The script owns only this lock and removes it on ordinary exit and handled signals.

Equal tips and local-ahead-only tips are no-ops. When upstream is ahead, or tips have diverged, the script records the exact original `main` commit in a new `refs/heads/backup/upstream-sync-*` ref using create-only expected-zero `git update-ref`, forces reference fsync, then verifies the ref's OID before attempting any main update. Existing backup refs are never replaced or pruned. A name collision advances the suffix and retries.

A fast-forward uses an expected-old compare-and-swap on `refs/heads/main`. For divergence, rebase is performed only in a disposable detached worktree. A conflict fails with nonzero status, aborts only that temporary rebase, removes the disposable worktree, leaves `main` and the checked-out files at the original state, and retains the backup. On success, a provenance bridge commit has the original `main` as first parent and the rebased upstream-plus-local history as second parent. This is required by the installed main reference gate, which only permits a new `main` tip descending from the old one. A final expected-old update-ref protects against writers that do not participate in this script's lock. The worktree/index are advanced only after that compare-and-swap succeeds.

The script's lock is not a global Git write lock. The main ref's expected-old compare-and-swap is authoritative against an independent ref writer, and an installed reference-transaction hook may impose additional rules. This upstream flow does **not** protect arbitrary direct `main` updates and is not a substitute for RUS-1508 / CONV-04's direct-merge gate.

## Failure handling and recovery

Every failure is nonzero and writes a `sync-upstream:` diagnostic to stderr. A failure before the backup is created leaves `main` untouched and creates no backup. A later failure retains the backup and reports the relevant old/new/backup identifiers where available. A conflict leaves the production checkout untouched because the rebase occurs in the disposable worktree.

After any failure:

1. Read the diagnostic and confirm no sync invocation remains active. Do not delete a backup ref.
2. Check `git status --short --branch`, `git rev-parse main`, `git rev-parse <backup-ref>`, and `git show --stat <backup-ref>` in the production checkout. Compare the current `main` OID with the reported expected-old OID.
3. For a rebase conflict, keep the retained old-main backup. Investigate the conflicting local/upstream changes in a separate disposable worktree; do not resolve by resetting production `main`, forcing an update, or editing the backup. Retry the canonical sync only after the issue has been resolved and production `main` is clean.
4. If the diagnostic says the main ref moved concurrently or the compare-and-swap failed, stop and inspect the new main tip and the retained backup. Do not retry blindly or move the ref back; another writer may have legitimate work.
5. If the ref advanced but the script reports checkout-update failure, the backup still identifies the old tip. Stop scheduled/manual syncs and reconcile the clean production index/worktree to the exact current `main` through the repository's approved recovery procedure; do not use `reset --hard` as an automatic repair.

All `backup/upstream-sync-*` refs are retained indefinitely. Retention cleanup is not part of this script.

## Fixture-only invocation

`tooling/scripts/test-sync-upstream.sh` constructs temporary local repositories and invokes the canonical script entry point. The script accepts `SYNC_UPSTREAM_ROOT` only when `SYNC_UPSTREAM_FIXTURE=1` is also set and the resolved checkout lives beneath a system temporary directory. The fixture override is not a deployment setting. Example manual invocation against a disposable checkout:

```sh
SYNC_UPSTREAM_FIXTURE=1 \
SYNC_UPSTREAM_ROOT=/tmp/disposable-ctn-checkout \
  tooling/scripts/sync-upstream.sh
```

The fixture suite uses no network. It creates independent bare `upstream` and `origin` repositories and tests equal, ahead-only, behind, divergent, dirty staged/unstaged/untracked, in-progress operation, conflict, fetch failure, backup collision, lock contention, concurrent ref change, and direct-main-update isolation. Tests assert the original main OID and backup reachability, and verify that no push reaches origin.

## Host installation and existing schedule

Deployment was performed without executing the script against live `main`. The previous 56-line `/bin/sh` implementation is retained as `/Users/t/Projects/CTN/.fusion/sync-upstream.sh.bak-2026-09-29T0956Z` (SHA-256 `de6d4e16cc4d38e41081ca1e785a449727323592deb38a4c2120c7fb6f47f9b3`). The installed executable copy has the same SHA-256 as the fixture-tested source (`761ee46329bd7bdcbb4ac8f03d31079c16e0381f8fd3e8047096f4b61ab95ba9`); Bash syntax passes. The root worktree still has the user's modified `.gitignore` and deleted `.agents/skills/live-debug`, which the new script refuses before fetching.

On 2026-09-29, a local source-built Fusion `0.78.0-beta.5` dashboard (compatible with database schema 0085) was started on loopback with `--paused`. Its **existing project routine** `9b42d21f-588c-49ed-bc05-cc237d952395` (“Синхронизация main с upstream”) was read from the project-scoped API: cron `0 */3 * * *` (UTC in Fusion's cron parser), `command=/Users/t/Projects/CTN/.fusion/sync-upstream.sh`, no `steps`, `catchUpPolicy=skip`, `executionPolicy=reject`, initially `enabled=false`. PATCH of that same ID changed only `enabled=true`; a subsequent GET confirmed unchanged identity, cron, command and enabled state with `nextRunAt=2026-09-29T12:00:00.000Z`. The last historical run remains `2026-09-24T09:00:43.787Z`, failed on the dirty tree **under the previous unsafe script** (it fetched before refusal); `runCount=6`. No new-script production run or successful periodic execution is claimed. The paused inspection engine was stopped, and its temporary project `enginePaused=true` setting was restored to the original `false` by API readback. The installed global Fusion `0.77.0` cannot open schema 0085; no compatible **persistent** engine was verified after this inspection. The routine is configured/enabled, but live recurrence requires a compatible long-lived Fusion engine. Even with an engine, the currently dirty root must be cleaned by its owner before sync can advance.

## Verification ledger

| Item | Evidence/status |
|---|---|
| Canonical script and fixture source | `operator/w00-rus-1507` commit `1cd31394a`; fixture suite passed equal/ahead/behind/diverged, dirty staged/unstaged/untracked, preexisting operation, conflict, fetch failure, backup collision, overlapping runs, ref race and direct-main negative. `bash -n`, `just check`, `git diff --check` passed. |
| Production root and branch behavior | Fixed `/Users/t/Projects/CTN` on `main`; temporary-directory-only fixture override. Root remains dirty with user-owned `.gitignore` modification and deleted `.agents/skills/live-debug`; no live sync run. |
| Installed `/Users/t/Projects/CTN/.fusion/sync-upstream.sh` | Installed SHA-256 `761ee46329bd7bdcbb4ac8f03d31079c16e0381f8fd3e8047096f4b61ab95ba9`, executable `-rwxr-xr-x`, matching tested source; old SHA `de6d4e16cc4d38e41081ca1e785a449727323592deb38a4c2120c7fb6f47f9b3` retained at `.fusion/sync-upstream.sh.bak-2026-09-29T0956Z`. |
| Fusion procedure enabled state / schedule / timezone / command | Project routine `9b42d21f-588c-49ed-bc05-cc237d952395`: `enabled=true` on readback, cron `0 */3 * * *` UTC, exact absolute installed command, no steps, next scheduled `2026-09-29T12:00:00Z` when read. Last run 2026-09-24 failed (previous script), and no compatible persistent engine is currently verified. |
| Live rebase / push | Not performed. Fixture used distinct local origin and upstream and asserted no origin push. |
| CONV-04 direct-main gate | Separate control; not changed or claimed complete by this runbook. |

The existing routine's enabled configuration is not proof that a scheduler process will be running at its next due time or that dirty production `main` can sync. Fixture passes prove the script's behavior only; production execution remains separately unverified.
