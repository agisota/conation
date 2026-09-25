# RUS/CTN integration without file deletion

## Objective

Preserve every existing RUS/CTN task branch and working tree, never accept the thousands of accidental tracked-file deletions, and carry independently verifiable task-specific changes forward as far as their current plans, dependencies, review and main-ref safety gate allow. This is not permission to mark unfinished Fusion tasks done or to merge unreviewed product changes into `main`.

## Observed baseline (2026-09-25)

- CTN `main` is `484c8708a901f74cf34fd74e99df2111f8ceba23`, ahead of `origin/main` by eight commits and behind by 45; the root checkout has an existing `.gitignore` modification and a missing `.agents/skills/live-debug` path. Leave both as found.
- Fusion task records: 2,584 RUS/CTN total, 2,333 archived, 251 non-archived (120 RUS and 131 CTN). 151 current task records point to a linked worktree; some additional manually retained worktrees are not recorded on the task. A branch ahead of main can contain only a copied dependency commit or an upstream PR, not the task's proposed change.
- At least 13 linked trees have thousands of missing tracked paths (`Cargo.toml`, `crates/`, `infra/`, `tooling/`); some contain valuable staged, modified, untracked or conflicted task work. A Git-status deletion is never evidence of authorized removal.
- RUS-1508 remains paused with no completed acceptance steps. Its project mission keeps product merges frozen until the actual Fusion main-update route and backup-before-candidate/CAS protection are proven, including negative controls. RUS-1496 has additional dependencies, including RUS-1528 security rotation. Do not use `.fusion/sync-upstream.sh` as a workaround.
- An immutable backup ref `backup/pre-rus-ctn-integration-20260925-484c8708a` points to the original local main. The isolated checkout is `operator/apply-rus-ctn-20260925b`; an interrupted checkout also left `operator/apply-rus-ctn-20260925` and an unregistered directory, which must not be deleted or treated as a ready worktree.

## Acceptance

1. Every non-archived RUS/CTN item is classified by actual task state and available code artifact. Branch-only copied dependency content is not counted as implementation; archived tasks remain unchanged and accounted for.
2. No tracked-file deletion from a damaged worktree is staged, committed, merged or pushed; no existing user files, task branches, worktrees or backups are deleted, reset or cleaned. Preserve distinct HEAD/index/worktree/untracked and conflict evidence.
3. Independently available task-specific patches are carried into separate, retained working branches (or this integration branch only after successful per-task review), with source SHA/path provenance. A patch requiring an unapproved plan or unsatisfied dependency remains held, not silently accepted.
4. Run focused behavioral checks for each actual applied patch, inspect no-file-deletion status, and exercise the changed path. Failures remain explicit, not reclassified as passing.
5. Update `main` only if the installed and live Fusion route satisfies the RUS-1508 hold/release requirements, and only after authorized task approvals, task acceptance and regression verification. Otherwise deliver verified candidate branches and an exact blocked list without moving main or pushing to corporate origin.

## Non-goals and boundaries

No mass repair of Fusion-owned worktrees, no guessed resolution of four-way conflicts, no forced production credential rotation, no speculative re-implementation of all 251 missions, and no branch deletion. An existing PR patch, a copied dependency commit, a queued task, and a fully accepted task are different artifacts. The operator will use new isolated checkouts rather than mutating currently running Fusion worktrees.
