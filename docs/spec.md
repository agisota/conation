# RUS/CTN integration without file deletion

## Objective

Diagnose all 32 failed RUS/CTN task runs and prepare an individual specification for each of the 230 non-done cards. Prepare independent candidate PRs in parallel waves, then integrate accepted candidates into local `main` serially with one writer and expected-old compare-and-swap (CAS). Preserve every existing task branch and working tree; never accept accidental tracked-file deletions. CTN-184 remains owned by its existing owner. This scope authorizes free personal local use; paid HIPAA/compliance promises and certificates are excluded.

## Current integration state (2026-09-29)

- Fresh upstream `origin/main` is `6efb9d2ade28dd5639265c1ac88e8dc46ea377f8`. The sync merge is `0f002d8aa27cd4e022b71e7da55c58e51fcdaf52`, with parents `6efb9d2ade28dd5639265c1ac88e8dc46ea377f8` and `484c8708a901f74cf34fd74e99df2111f8ceba23`. Root local `main` was successfully fast-forwarded to this merge; this does not imply any product candidate has been integrated or approved.
- Before that main update, `backup/pre-main-sync-20260929-484c8708a` was read back at exact old-main OID `484c8708a901f74cf34fd74e99df2111f8ceba23`. After sync, `backup/post-sync-origin-main-20260929-6efb9d2ade` was read back at exact fetched origin commit `6efb9d2ade28dd5639265c1ac88e8dc46ea377f8`, tree `7a13add46da0ac3cbbe40ebeb594f8cffef407b1`. Private GitHub [agisota/ctn-private-integration-20260925](https://github.com/agisota/ctn-private-integration-20260925) readback: `refs/heads/operator/sync-origin-20260929b` → merge `0f002d8aa27cd4e022b71e7da55c58e51fcdaf52`; `refs/heads/backup/pre-main-sync-20260929-484c8708a` → old main `484c8708a901f74cf34fd74e99df2111f8ceba23`; `refs/heads/backup/post-sync-origin-main-20260929-6efb9d2ade` → fetched origin `6efb9d2ade28dd5639265c1ac88e8dc46ea377f8` and tree `7a13add46da0ac3cbbe40ebeb594f8cffef407b1`. No direct push to the corporate repository is authorized.
- Gate 19 passed for the sync. Biome and rustfmt passed; full runtime tests have not been run on the new merge head. Do not infer product-candidate runtime verification from these checks.
- The fetched-origin backup is an exact upstream snapshot, distinct from the pre-update local-main backup. Before every later local-main update, capture the current `main` OID, create and read back a new uniquely named retained backup at that exact OID, then update only with an expected-old CAS. Verify the new `main`, backup, tree and no-deletion invariant after each serial update; on an OID race, stop and re-evaluate.

## Historical baseline and candidate evidence

- Before the 2026-09-29 sync, local `main` was eight commits ahead of and 193 behind `origin/main` at `6efb9d2ade28dd5639265c1ac88e8dc46ea377f8`. This is the dated pre-sync 8/193 observation, not the current divergence.
- The earlier isolated candidate was `511163981bfa1b9e48b9bc2da8e04582d2b6191e`, based on old local main `484c8708a901f74cf34fd74e99df2111f8ceba23`. The five candidate changes and their reported focused verification below apply only to that old candidate revision. They are not verification of the new sync merge or a claim that product changes are on `main`.
- The old inventory counted 2,584 RUS/CTN records, 2,333 archived and 251 non-archived (120 RUS, 131 CTN). The later 2026-09-29 live task snapshot classified those 251 as 21 done, 72 in review, 157 todo and CTN-184 in progress. Thus 230 were not done at that snapshot; the 230-card spec effort is not a claim of 230 ready-to-merge patches.
- At least 13 linked trees had thousands of missing tracked paths (`Cargo.toml`, `crates/`, `infra/`, `tooling/`); some also contained valuable staged, modified, untracked or conflicted work. A Git-status deletion is never evidence of authorized removal.

## Acceptance

1. Diagnose all 32 failed analyses with evidence and actionable disposition; maintain the diagnosis in [failed analyses](specifications/failed.md).
2. Deliver one individual specification for each of the 230 unfinished RUS/CTN cards, preserving existing owners, task state and actual dependencies. Keep CTN-184 with its current owner.
3. Organize independent task work as parallel candidate PR waves; integrate only accepted candidates serially into local `main`, one writer at a time, with a fresh exact-OID backup and expected-old CAS before every update. Track wave ownership and dependency ordering in [waves](specifications/waves.md).
4. No tracked-file deletion from a damaged worktree may be staged, committed or integrated; preserve distinct HEAD/index/worktree/untracked/conflict evidence. Never reset, clean, overwrite or delete user files, task branches or worktrees.
5. Verify each candidate on its exact final PR head, including focused behavioral checks and a smoke scenario before local-main integration. Preserve limitations and failed checks as explicit evidence; formatting or gate checks do not substitute for runtime verification.
6. Keep the root checkout's user changes intact. Use private GitHub only for the authorized integration artifacts; do not push directly to the corporate repository.

## Non-goals and boundaries

No mass repair of Fusion-owned worktrees, guessed resolution of conflicts, forced credential rotation, speculative reimplementation of all missions, or branch deletion. An existing PR patch, copied dependency commit, queued task and accepted task are distinct artifacts. Free personal local use is in scope; paid HIPAA/compliance work and certification are not. See [the project README](specifications/README.md) for the operating contract.
