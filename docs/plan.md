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

## Local sign-in checkpoint, 30 September 2026

- The isolated `conation-login-stalwart` container is healthy. SMTP delivery
  and JMAP readback were verified for `login-test@conation.test`. It is also
  reachable on port 25 from the isolated `auth-conation-auth-probe` Docker
  network; no ROX mail service or volume was changed.
- Ten missing `xtask_local` functions and a duplicate `scheduled_action_service`
  inventory entry were repaired. `cargo check` passed for the first fix;
  after removing the duplicate, `stack up` dry-run generated the Compose and
  FusionAuth kickstart artifacts and `docker compose config -q` passed. The
  later configurable preview-origin and SMTP source edits passed targeted
  `rustfmt --check` but have **not** been recompiled due to disk pressure.
- The generated instance is `conation-auth-probe` with port base `27000`.
  Its proxy would listen on `127.0.0.1:27009`. The generated local environment
  and FusionAuth kickstart currently point SMTP at
  `conation-login-stalwart:25`, sender `noreply@conation.test`. These generated
  files are local artifacts and a future generator run must pass
  `CONATION_LOCAL_SMTP_HOST=conation-login-stalwart`,
  `CONATION_LOCAL_SMTP_PORT=25`,
  `CONATION_LOCAL_SENDER_BASE_ADDRESS=conation.test`,
  `CONATION_LOCAL_SMTP_FROM=noreply@conation.test`, and
  `CONATION_LOCAL_PREVIEW_PORT=3004` to reproduce them. Export these in the
  calling shell before `just stack up`; `--env-file` alone does not feed these
  generator inputs.
- The auth stack is **not running**. A cold pull/build would need FusionAuth,
  its PostgreSQL, app PostgreSQL with pgvector, Redis Stack, and an
  `authentication_service` binary; the repo's full infra path also starts
  Kafka, OpenSearch, and LocalStack. Available disk space fell below 3 GiB
  during the probe, so no images were pulled. Do not claim local sign-in from
  the working SMTP check.
- The local auth build exposes a passwordless code in its HTTP response through
  `return_passwordless_code`. This named stack is for loopback testing only;
  no public tunnel, LAN binding, or cloud deployment is part of this plan.
- Resume by compiling the final `xtask_local` changes, starting only the
  named auth dependencies with loopback published ports, migrating the app
  database, and building the single auth binary. After the proxy and auth
  service answer, point the Vite preview at `http://127.0.0.1:27009`, send a
  code to the disposable local mailbox, read that message through JMAP, and
  redeem the code in the browser. Check session refresh and logout before
  marking sign-in complete.
- The preview origin and SMTP sender/template are applied at generation or
  FusionAuth bootstrap. `stack update` does not reconcile these changes on an
  existing instance. Use a fresh disposable named instance for the next
  end-to-end test; `stack up` resets that instance's volumes. The OAuth
  redirect allowlist for other flows has not been exercised in this browser.
