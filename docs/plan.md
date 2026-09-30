# Conation local launch and repository consolidation plan

| Step | Owner | Depends on | Verification |
| --- | --- | --- | --- |
| Preserve the localized Conation branch in the CTN repository | Repository operator | Existing `conation/main` SHA and CTN write access | Read back the transferred ref and commit SHA from GitHub |
| Repair theme ID compatibility and localized labels | Web owner | Existing rebrand and locale contracts | Diff/Biome checks and browser welcome smoke test |
| Make the transferred branch the CTN default | Repository operator | Transferred ref verified | GitHub default branch readback; existing CTN PR bases unchanged |
| Rename the prior repo to `conation-legacy-20260930`, then CTN to `conation` | Repository operator | Default branch verified, legacy name free | Read back both repository URLs, refs, PRs, and local remotes |
| Run isolated local mail transport | Backend owner | Free loopback ports and isolated data volume | SMTP delivery and JMAP mailbox readback |
| Bring up local auth and complete sign-in | Backend owner | FusionAuth, auth service, database, SMTP route | Disposable code send → receive → redeem and refresh/logout checks |
| Finish Russian localization | Web and backend owners | Inventory of remaining visible strings and delivery paths | UI audit, catalog/ICU tests, bilingual delivery snapshots, browser language switch |

The repository naming and theme repair may finish before the backend build.
Until the sign-in verification passes, report the browser as a local frontend
preview and the mail server as a separate working component. The current
dated task inventory is tracked in `docs/specifications` on the CTN branches;
its status must be refreshed before declaring a release gate complete.
