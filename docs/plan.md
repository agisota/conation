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

- RUS-1436 and CTN-009: task-specific unstaged and untracked work is being
  reconstructed on separate clean branches. The original 5,000+ missing paths
  are not part of either patch.
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
  contain only A/M paths. Those commits were applied without committing to
  a separate clean checkout; its PR #6709 remains draft with an old remote
  head and historically failed checks. A local fix is not evidence that the
  PR itself is green. Keep its tested candidate separate until review.
- Remaining unlinked RUS/CTN cards were checked for unique task patches,
  owner state and dependencies. Copied-main branches, already-landed
  follow-ups, incomplete queued tasks and actively owned or review-blocked
  PRs are retained in the inventory, not counted as ready application.

For each held item, preserve its original source ref and task state. The
selected RUS-1443 and CTN-011 candidate branches are not task acceptance or
release approval. No source PR was bulk merged or allowed to transfer missing
tracked paths.
