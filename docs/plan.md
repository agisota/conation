# RUS/CTN preservation and application plan

Source of acceptance: [spec.md](spec.md). Release integrator owns local-main updates; each card's existing owner retains its task and candidate ownership. Free personal local use is authorized; paid HIPAA/compliance work and certification are excluded. No direct corporate-repository push.

## Current status — 2026-09-29

- The fresh upstream snapshot is `6efb9d2ade28dd5639265c1ac88e8dc46ea377f8`. Local `main` was synchronized by merge `0f002d8aa27cd4e022b71e7da55c58e51fcdaf52` (parents: `6efb9d2ade28dd5639265c1ac88e8dc46ea377f8`, then old local main `484c8708a901f74cf34fd74e99df2111f8ceba23`). Root `main` now points at that merge; the root `.gitignore` modification and missing `.agents/skills/live-debug` path remain intact.
- Before the update, local backup `backup/pre-main-sync-20260929-484c8708a` read back as `484c8708a901f74cf34fd74e99df2111f8ceba23`. The exact fetched-origin backup `backup/post-sync-origin-main-20260929-6efb9d2ade` reads back as commit `6efb9d2ade28dd5639265c1ac88e8dc46ea377f8` and tree `7a13add46da0ac3cbbe40ebeb594f8cffef407b1`.
- Private publication was read back at [agisota/ctn-private-integration-20260925](https://github.com/agisota/ctn-private-integration-20260925): `refs/heads/operator/sync-origin-20260929b` → `0f002d8aa27cd4e022b71e7da55c58e51fcdaf52`; `refs/heads/backup/pre-main-sync-20260929-484c8708a` → `484c8708a901f74cf34fd74e99df2111f8ceba23`; `refs/heads/backup/post-sync-origin-main-20260929-6efb9d2ade` → `6efb9d2ade28dd5639265c1ac88e8dc46ea377f8` (tree `7a13add46da0ac3cbbe40ebeb594f8cffef407b1`). These are private recovery/integration refs, not authorization to push to corporate `origin`.
- Gate 19 passed for the sync, and Biome and rustfmt passed. Full runtime tests have not been run at `0f002d8`; candidate behavior must be verified on its own exact final head.
- Pre-sync inventory: 2,584 cards total, 2,333 archived; 251 non-archived, of which 21 were done, 72 in review, 157 todo, and CTN-184 in progress under its existing owner. Therefore 230 cards were unfinished in that dated snapshot. Live counts can change; reconcile before producing the final card set.

## Owner and dependency roadmap

| Phase | Owner / inputs | Deliverable | Depends on | Exit verification |
| --- | --- | --- | --- | --- |
| SYNC | Release integrator; upstream OID and preserved old local main | Completed isolated upstream sync and retained exact old-main and post-sync upstream backups; maintain the private refs above | Complete | Commit parents, local refs, exact backup commit/tree readbacks and unchanged root user changes recorded |
| FAILED-32 | Diagnosis owners per failed record; `docs/specifications/failed-evidence.json` | Evidence-backed diagnosis and actionable next step for all 32 failed analyses; summary in [failed.md](specifications/failed.md) | SYNC baseline | All 32 source records reconciled; distinguish missing evidence, dependency blockers, candidate fixes and already-resolved cases |
| CARD-SPECS-230 | Existing card owner per unfinished RUS/CTN card; shared inventory and mission prompt | One individual, linked specification per non-done card; no reassigning CTN-184 | SYNC; FAILED-32 findings where relevant | Reconcile exact card IDs to current non-done inventory; each spec names owner, observable acceptance, dependencies, source/provenance and verification |
| CANDIDATE WAVES | Existing task owners in parallel, one owner per card/branch and disjoint file ownership | Independent candidate PRs grouped by real dependency and consumer interfaces; retain incomplete/blocked work unmerged. See [waves.md](specifications/waves.md). | Relevant per-card spec and prerequisite interfaces; independent tasks may proceed in parallel | Each PR based on accepted upstream baseline or explicit dependency PR; exact head reviewed, no accidental D paths, task acceptance satisfied |
| SERIAL LOCAL MAIN | Release integrator only; accepted candidate PR heads | Integrate one accepted candidate at a time into local `main`, preserving source refs and no-delete invariant | Candidate wave exit checks; actual dependency PRs integrated first | Before every update, retain/read back a unique backup at captured old-main OID; update via expected-old CAS; verify new OID/tree, no D paths and backup before next candidate |
| REPORT | Release integrator + card owners | Update the [project README](specifications/README.md), failed diagnosis and wave status from observed evidence | All relevant work above | Report exact refs, heads, checks and limitations; do not claim unpublished corporate changes or unrun runtime checks |

## Execution rules

1. Reconcile all 32 failed diagnoses and the 230 unfinished-card specs; do not equate a task record, copied dependency commit, PR, or plan with an implementation.
2. Dispatch independent candidate PRs in parallel waves, with one writer per card/branch and no overlapping ownership. Dependencies block only when the inventory/task spec names them or the consumer requires their interface; shared files or topic alone require coordination, not invented dependency edges.
3. Verify each candidate's exact final head with focused behavior checks and a smoke scenario; record unresolved review, CI, external-service or authenticated-UI limits. Gate 19, Biome, and rustfmt at the sync merge are not candidate runtime tests.
4. Integrate accepted candidates serially into local `main`. Before every main update: capture old OID, create a uniquely named retained backup, read it back and confirm exact equality, then perform expected-old CAS. Read back main and backup and verify tree/no-delete invariants after each transition. OID race or mismatch means stop and re-evaluate, never blindly retry.
5. Keep Fusion-managed trees and root user changes untouched. Never use `git add -A`, reset, clean, branch deletion, mass restore, or automated cherry-pick of commits containing deletions. Keep corporate `origin` read-only; private GitHub refs are for authorized integration backup/publication only.

## Historical setup and triage

The earlier isolated candidate was `511163981bfa1b9e48b9bc2da8e04582d2b6191e`, based on pre-sync local main `484c8708a901f74cf34fd74e99df2111f8ceba23`. Its inventory and candidate findings below are historical, not the current `main` state.

The initial isolated checkout was registered with `--no-checkout`, then its index was loaded from HEAD and tracked source files materialized. A first interrupted `git worktree add` left an unregistered copied directory and unused `operator/apply-rus-ctn-20260925` ref; preserve rather than delete them.

### Task-artifact triage at the old candidate

The inventory recorded every non-archived card, including queued cards with no task patch; a `taskCommits` subject match was not proof a patch belonged to the task:

- RUS-1436 and CTN-009 task-specific unstaged/untracked work was reconstructed on separate clean branches; the 5,000+ missing paths were not included.
- RUS-1443 nested PR #6850 needed cross-account local-storage leakage and storage-failure repairs. RUS-1442 draft PR #6851 was held for product/review and CI decisions. RUS-161 depended on an unmerged, changes-requested header-storage PR.
- RUS-1441 and RUS-058 changes were already on old main. RUS-1435's closed migration-tools PR used obsolete paths and potentially destructive scripts. RUS-1242 overlapped CTN-332 and newer code.
- CTN-011's shared-link/calendar commits needed classifier, touch/keyboard and production-consumer repairs. CTN-007/014/563 lacked complete consumers; CTN-013 did not fix the reported code-exchange path.
- CTN-184 was actively owned elsewhere. CTN-518's iOS preview PR needed app-lifecycle and stale-build publication fences. CTN-283/759/944 mixed indexed PR content with missing paths; CTN-944 had four unresolved conflicts. CTN-058 lacked deterministic multi-connection regression and depended on its scheduled-action PR. CTN-093/256 had no accepted task patch.
- CTN-176's task-specific commits contained only A/M paths and were copied to a clean local candidate. Original PR #6709 was a draft at older head `e7e387844dec61583579ed6faf4ed107a1670a7c`, with failing Biome Check and Web App Status Check observed 2026-09-26. Local repairs did not update or green that PR.
- Reviewed RUS-1436, RUS-1443, CTN-009, CTN-011 and CTN-176 commits were integrated only on old candidate `operator/apply-rus-ctn-20260925b`, not on the task PR heads. No source PR was bulk merged and no missing paths were transferred.

## Historical verification on the old candidate

The following results apply only to `511163981bfa1b9e48b9bc2da8e04582d2b6191e` and its integrated candidate changes. They are not tests of merge `0f002d8aa27cd4e022b71e7da55c58e51fcdaf52`:

- That candidate passed 14 focused Vitest files / 163 tests across paste, per-user drafts and cross-tab attachments, external destinations/calendar links, and Duplicate as Task. Biome CI passed for 26 changed web files and three changed lexical-core files.
- CTN-009 passed 20 SDK tests, `tsc --noEmit`, SDK build and scoped Biome on that candidate. Its CLI dry-run listed company/contact operations without a write and rejected an invalid `foo..com` batch before key/network access.
- Three changed MDX pages compiled; a local documentation preview navigated the API-key guide and CRM recipe and captured screenshots. Full docs lint was blocked by three pre-existing generated MCP MDX parser errors; full web typecheck had pre-existing QueryClient version incompatibilities. The browser had no authenticated editor without the required backend, so this was not a live account smoke.
- CTN-011's physical-venue classifier fix was recorded as `d856e0f5c`; its changed calendar component passed 17 focused tests (two physical venues and one virtual negative control) and scoped Biome on the old candidate.
- The old candidate had no tracked deletions. Original CTN-176 draft PR #6709 was observed at older head `e7e387844dec61583579ed6faf4ed107a1670a7c` with failing Biome Check and Web App Status Check on 2026-09-26. The local candidate repairs did not update or green that remote PR.

## Ongoing work and completion evidence

- Reconcile all 32 failed records against [failed.md](specifications/failed.md) and their source evidence; keep diagnoses distinct from candidate implementation.
- Produce and link individual specs for each current non-done card. Their count and owners are governed by the live inventory; the 230 figure above is the dated 2026-09-29 snapshot. Keep CTN-184 assigned to its existing owner.
- Execute dependency-aware candidate waves in [waves.md](specifications/waves.md): parallelize independent cards, sequence only documented/interface-required dependencies, and verify each candidate's exact PR head.
- After candidate acceptance and verification, integrate serially into local `main` with a new exact old-OID backup plus CAS for every update. No PR merge button, auto-merge, corporate remote ref update or direct corporate push.
- Update [the project README](specifications/README.md) with the observed current inventory, candidate heads, checks, blockers, and private backup refs. Never report gate 19, Biome or rustfmt as full runtime test coverage.
