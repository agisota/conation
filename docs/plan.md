# RUS/CTN preservation and application plan

Source of acceptance: [spec.md](spec.md). Owner: operator. Product main remains frozen pending RUS-1508 evidence; this is a plan for execution, not an approval to bypass the gate.

| ID | Owner / inputs | Artifact and boundary | Depends on | Verification |
| --- | --- | --- | --- | --- |
| INVENTORY | Operator + independent RUS/CTN readers; live `.fusion/tasks`, linked worktrees and Git refs | Complete per-ID inventory for the 251 non-archived cards, marking task state, actual own-code delta vs imported main/PR, worktree damage, dependencies and saved changes | none | Totals reconcile with live task count; samples checked against Git status, commits and original mission |
| GATE | Operator + independent gate reader; RUS-1508, installed hook, active Fusion route | Evidence-based hold/release decision, immutable baseline ref, separate integration checkout | none | Exact main SHA unchanged; backup readback matches; no merge/fetch/rebase/push against live main |
| RUS-CANDIDATES | Separate task agents, each with disjoint source paths and an isolated branch, never the Fusion-managed checkout | Preserve and adapt viable RUS task-specific work; keep the provenance of indexed, untracked and committed changes, without deleted-file paths | INVENTORY, GATE | Operator runs focused tests and smoke scenario per candidate; no D paths, and outstanding task review identified |
| CTN-CANDIDATES | Separate task agents, each with disjoint source paths and an isolated branch | Preserve and adapt viable CTN task-specific work without deletion; no implicit approval of stale PR content | INVENTORY, GATE | Operator runs focused tests and smoke scenario per candidate; no D paths |
| INTEGRATE | Operator; passing RUS/CTN candidate refs, branch file-overlap map and gate verdict | A retained reviewed candidate integration branch and/or independent task branches; live main only after RUS-1508 and task approvals pass | RUS-CANDIDATES, CTN-CANDIDATES | Combined targeted/full relevant checks, Git tree D-path check, main/backup ref verification; report SHA and explicit held IDs |

## Sequence and no-delete contract

1. Snapshot live task/branch inventory. Exclude the 2,333 archived cards from execution but retain their counts; review `done`, `todo`, `in-review` and `in-progress` separately. Copy-only `chore(...): import dependency content from main` is not a feature. The existing 13 damaged trees are sources for read-only patch extraction only.
2. Keep `main` and the Fusion-managed trees untouched. For each chosen viable task create a *new* isolated branch from the captured `main` or appropriate reviewed dependency; inspect task-specific diff including additions, modified source, tests, conflicts and staged versions. Never use `git add -A`, `reset --hard`, `clean`, branch deletion, mass restore or automated cherry-pick of a commit containing file deletions.
3. Dispatch independent RUS and CTN slices in parallel with one writer per new checkout. A worker edits only; the operator runs tests, diagnostics and smoke checks once at a phase boundary. Unsafe or incomplete patches remain separate with exact blockers rather than being forcibly merged.
4. Merge or replay only verified non-deleting changes on the isolated integration branch. Confirm the resulting Git tree retains the baseline tracked paths. Main release waits for demonstrated live gate safety and task approvals; do not reinterpret the user's request as undoing a security hold.

## Material alternatives

- Mass `git add -A` or reset the Fusion worktrees: rejected, because the 5,000-path deletions and real staged/untracked work are mixed.
- Bulk merge every `fusion/rus-*` and `fusion/ctn-*` branch: rejected, because many branches only mirror a dependency, others are failed/paused, and product merge freeze is still in force.
- Retain candidate refs in isolated worktrees and integrate verified patches behind the gate: chosen because it preserves every path and every unfinished task while allowing demonstrable forward progress.

## Decision and progress evidence

Initial `main` and backup are both `484c8708a901f74cf34fd74e99df2111f8ceba23`. A first interrupted `git worktree add` left an unregistered copied directory and an unused `operator/apply-rus-ctn-20260925` ref; they are preserved. `operator/apply-rus-ctn-20260925b` was registered with `--no-checkout`, then its empty index was loaded from HEAD and all tracked source files materialized; subsequent `git status` showed a clean source tree before these plan documents.

## Task-artifact triage after the inventory

The inventory records every non-archived card, including queued cards with no
task patch, but a `taskCommits` subject match is not proof that the patch belongs
to the task. Read-only reviews of the actual unusual artifacts yielded:

- RUS-1436 and CTN-009: task-specific unstaged and untracked work was
  reconstructed on separate clean branches. The original 5,000+ missing
  paths are not part of either patch.
- RUS-1443: nested PR #6850 has a five-file draft-persistence patch, but
  cross-account local-storage leakage and storage-failure handling require
  repairs. RUS-1442: closed draft PR #6851 and its separate changeset are
  held pending product/review and CI decisions. RUS-161: its one-file OAuth
  fix depends on an unmerged, changes-requested header-storage PR.
- RUS-1441 and RUS-058: the original change is already on main; additional
  follow-up is not a ready patch. RUS-1435: closed migration-tools PR uses
  obsolete paths and potentially destructive scripts. RUS-1242: 60-file
  sync refactor overlaps CTN-332 and newer main code.
- CTN-011: three distinct shared-link/calendar commits are a candidate only
  with map classifier, touch/keyboard and production-consumer repairs.
  CTN-007/014/563: isolated migration or schema tweaks have no complete
  consumers and must not be applied as finished features. CTN-013's
  forwarded-login patch does not repair the reported code-exchange path.
- CTN-184 is actively owned elsewhere; CTN-518's iOS preview PR needs a
  closed/reopened app lifecycle and stale-build publication fence. CTN-283,
  CTN-759 and CTN-944 contain indexed PR content mixed with missing tracked
  files; CTN-944 additionally has four unresolved conflicts. CTN-058's
  claim-fence hunk depends on its scheduled-action PR and lacks a deterministic
  multi-connection regression. CTN-093/256 contain no accepted task patch.
- CTN-176: unlike the other unlinked cards, its two task-specific commits
  contain only A/M paths and were copied into a clean local candidate.
  Its PR #6709 remains a draft at its older remote head with failed Biome/Web
  checks as observed on 2026-09-26. Ordinary-Markdown eligibility and
  targeted Biome failures were repaired and integrated behind the main freeze.
  This does not update or turn green the original PR.
- Remaining unlinked RUS/CTN cards were checked for unique task patches,
  owner state and dependencies. Copied-main branches, already-landed
  follow-ups, incomplete queued tasks and actively owned or review-blocked
  PRs are retained in the inventory, not counted as ready application.

For each held item, preserve its original source ref and task state. Reviewed
local RUS-1436, RUS-1443, CTN-009, CTN-011 and CTN-176 commits are
integrated only on `operator/apply-rus-ctn-20260925b`, not on main or the
task PR heads. No source PR was bulk merged or allowed to transfer missing
tracked paths.

## Integrated verification boundaries

- The final isolated branch passed 14 focused Vitest files and 163 tests
  together across paste, per-user drafts and cross-tab attachments, external
  destinations/calendar links, and Duplicate as Task. Biome CI passed for
  all 26 changed web files and all three changed lexical-core files.
  CTN-009 passed 20 SDK tests, `tsc --noEmit`, SDK build and scoped Biome CI
  on that same integrated branch. Its CLI dry-run lists company/contact
  operations without a write, and rejects an invalid `foo..com` batch before
  any key/network access; tests cover the backend policy list, no-requests
  preflight, same-import company handles and partial-failure reporting.
- The three changed MDX pages compiled, and a local documentation preview
  navigated the byte-identical API-key guide and CRM recipe and captured
  screenshots. Full docs lint is blocked by three pre-existing
  generated MCP MDX parser errors; full web typecheck has pre-existing
  QueryClient version incompatibilities. The local web browser loaded its
  shell but displayed no authenticated editor without the required backend;
  focused component interaction tests cover the edited surfaces, not a live
  account session.
- Main and backup must still match the captured baseline. PR #6709's remote
  Biome and Web Status checks remain red at its older draft head. These local
  commits do not release or override RUS-1508's main-update safety gate.

## Live diagnosis and next owners — 2026-09-29

The live Fusion task records still match the dated inventory: 2,584 RUS/CTN
cards, of which 2,333 are archived. Of the 251 non-archived cards, 21 are
`done`, 72 `in-review`, 157 `todo`, and CTN-184 alone is `in-progress`.
Thus 230 board cards are not done, but they are not 230 independently
merge-ready patches, nor must all 230 finish before these five candidate
changes can be considered. `done` can mean a PR review or plan was completed,
not that code landed on this local `main`.

The candidate is a descendant of `main` and has no deleted tracked paths.
The local `main` and its retained pre-integration backup still point to
`484c8708a901f74cf34fd74e99df2111f8ceba23`; remote-tracking
`origin/main` differs by eight local and 45 upstream commits. This is a
separate reconciliation problem for publication, not a technical inability
to fast-forward local `main`. Original CTN-176 draft PR #6709 remains on its
older head `e7e387844dec61583579ed6faf4ed107a1670a7c`, with failing
Biome Check and Web App Status Check; this local candidate does not fix that
remote PR.

The installed reference-transaction hook and tracked Python gate have matching
Git object hashes. Nineteen direct-Git gate tests pass, including old-commit
backups and rejected updates in disposable repositories. This proves the
hook's tested behavior, **not** Fusion's installed end-to-end update route.
Independent source review found additional RUS-1508 gaps: a persisted
`aiMergeReviewReconciliation.candidateSha` can be reused after a fresh backup
reservation without rebuilding its older candidate; the pre-land squash guard
checks file scope but not a single direct parent equal to the reserved old;
the Fusion gate hardcodes the live CTN root so a different disposable repo
cannot exercise the CTN-specific path. The separate integrator lock and
effective configured runtime/bypass-denial evidence also remain unproven.
Keep the product merge hold; the Git hook alone does not release it.

| Owner / task | Required artifact | Release check |
| --- | --- | --- |
| Fusion merge owner — RUS-1508 | Map the configured entry and every enabled main writer; install a separately held integrator lock; invalidate pre-reservation stored candidates; verify direct-parent, tree and source provenance before old-OID CAS. Add a controlled disposable-repo test seam without changing the production CTN identity. | Invoke the actual configured entry in a disposable repo; observe backup before candidate, unique old-based squash, expected-old CAS, and missing/substituted hook, stale candidate, failed backup and race denial without a main/upstream update. |
| CTN gate owner — RUS-1508 | Preserve the sole durable backup writer and exact receipt/effective-hook binding; document installation, rollback and ordinary Git fallback. | Test normal Git FF, squash, update-ref, packed/linked worktrees and negative controls; obtain the Fusion real-route evidence above before an explicit release decision. |
| Individual RUS/CTN PR owners | Finish incomplete consumers, review and CI on their own task/PR heads; never copy the 5,000-plus missing tracked paths from damaged Fusion trees. Start with held RUS-1442/161 and CTN-007/014/013/518/283/759/944/058 while leaving the already-owned CTN-184 to its owner. | Per-card behavior and dependencies accepted on the actual final head, with code provenance separate from imported upstream changes. |
| Candidate integrator | Retain RUS-1436/1443 and CTN-009/011/176 in the isolated branch; investigate and repair independent review findings, including physical calendar addresses containing meeting words. | Focused component/SDK checks and relevant UI smoke on the final candidate; no tracked deletions, reviewed task scope, no new source PR assumed green. |
| Release integrator (only after gate release) | Reconcile the eight-versus-45 local/upstream divergence without resetting user work; capture another old-main backup, recheck candidate and approvals, then use the controlled main update route. | Main and backup OIDs and resulting tree verified; no automatic corporate-origin push or silent branch deletion. |
