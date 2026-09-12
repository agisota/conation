# Conation history topology

Product main is **`conation/main`**. It keeps Macro ancestry. This document
closes the leftover `conation/standalone-snapshot` / `clean-history` /
`overlay` question from the stabilization PRD.

## Decision

Do **not** rewrite `conation/main` onto an orphan snapshot. Do **not** merge
`conation/standalone-snapshot`, `conation/clean-history`, or `conation/overlay`
into product main.

Those refs stay as archives. New work branches from current `conation/main`.

## Why the leftovers exist

| Ref | What it is | vs `conation/main` | Use |
| --- | --- | --- | --- |
| `conation/main` | Product line: rebrand, Stalwart, i18n, self-host, tasks/canvas | — | **Ship here.** |
| `conation/standalone-snapshot` | Orphan root + Russian-default commit (`d214aa56bb`, `2e829e7d1a`) | 2 ahead / thousands behind (no shared history) | Archive. Same intent already lives on `conation/main`. |
| `conation/clean-history` | History rewrite without Macro parents | 1 unique snapshot commit | Archive. PRD non-goal. |
| `conation/overlay` | Keep-`macro_*` crates experiment on an old Macro tip | 2 unique / 103 behind | Skip. Fights the crate-rename product line. |
| `conation/upstream-sync` | Alternate 2026-09 sync with mass `auto.*` i18n | 2 unique / 92 behind | Skip as-is. Fresh upstream merges start from **current** `conation/main`. |
| `conation/parallel-*` | Ports on the orphan snapshot | already re-implemented as `conation/w-port-*` | Close. Do not cherry-pick. |

`conation-private/main` (when present) may still be a stale Macro snapshot.
Published product is `conation-private/conation/main`, not that default.

## Operator rules

1. Branch from `conation/main`.
2. Do not `reset --hard` product main onto `clean-history` or `standalone-snapshot`.
3. Do not take mass `auto.*` i18n from the old `upstream-sync` line.
4. Merge Macro `upstream/main` **into** `conation/main` in a dedicated session.
   Expect branding/lockfile/workflow conflicts. Do not publish Conation onto
   `macro-inc/macro`.

Rebrand *names* stay in [REBRAND_CONATION.md](REBRAND_CONATION.md). Git history
topology stays here.
