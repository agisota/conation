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

The source file is not the installed host copy. Deployment is a separate authorized operation and has **not** been performed as part of this isolated source task. Once reviewed and validated, an operator with host access should preserve any materially different installed copy, stage the canonical content beside `/Users/t/Projects/CTN/.fusion/sync-upstream.sh`, install atomically, set executable permissions, and read back the installed bytes/hash, shebang, and mode. Never test deployment by executing against live `main`; use fixture mode or compare the installed file byte-for-byte with the tested canonical source.

The existing Fusion procedure is also external scheduler state. Its record, identity, owner, enabled flag, timezone, exact schedule, absolute command, and execution/error history have **not been read back here**. The ticket expects the existing procedure at `0 */3 * * *` to target `/Users/t/Projects/CTN/.fusion/sync-upstream.sh`; this expected value is not evidence that the procedure is enabled or has run. Do not create a second schedule. Read the existing record through its supported interface and document the actual values before claiming operational acceptance.

## Verification ledger

| Item | Evidence/status |
|---|---|
| Canonical script and fixture source | Added in isolated branch `operator/w00-rus-1507`; not yet run or parent-reviewed. |
| Production root and branch behavior | Source requires `/Users/t/Projects/CTN`, local branch `main`; fixture override is temporary-directory-only. |
| Installed `/Users/t/Projects/CTN/.fusion/sync-upstream.sh` | Not changed or deployed. Existing script was read-only inspected; it fetches before dirty checking and excludes `.gitignore` dirt, so it is not equivalent to the fail-closed source. |
| Fusion procedure enabled state / schedule / timezone / command | Pending authorized external read-back; no enabled-state or successful-run claim. |
| Live rebase / push | Not performed. The script has no push command; fixtures are designed to verify the independent origin does not move. |
| CONV-04 direct-main gate | Separate control; not changed or claimed complete by this runbook. |

A passing fixture run and a scheduler record read-back are separate evidence. An enabled schedule alone does not prove a successful historical run; a fixture run does not prove deployment or scheduler enablement.
