# CTN corporate self-host acceptance

Status: **NO_GO** for a working corporate service. This document states observable acceptance, not a claim that any item has passed. The private integration branch is not the deployment or the user's CTN main tree. Intermediate build probes are documented in [SELFHOST_SOURCE_BASELINE.md](SELFHOST_SOURCE_BASELINE.md).

## Service boundary

A corporate owner activates an employee into an explicitly enrolled organization, provisions an owned mailbox, and uses mail, calendar, Canvas, calls, and agents through a self-hosted installation without unintentionally sending application data to Macro-hosted endpoints. Preservation, permission revocation, provider errors, restarts, and recovery are part of the result. No synthetic Mailpit flow, provider stub, local-only mock, static source inspection, or web bundle by itself constitutes service acceptance.

## Observable gates

| Gate | Proof required |
| --- | --- |
| T01 | Complete, pinned final-revision web/WASM and declared service binary closure on target platform; repeat independent clean build and compare provenance/artifact hashes. |
| T02 | Create/edit/link all promised entity classes and reopen after restart, including mail, event, agent, call recording/transcript and summary where consent permits. |
| T03 | Backup populated live stack, restore into clean target, migrate, verify object and secret integrity; fail closed on conflicting writers, wrong daemon/instance, damaged archive and interrupted recovery. |
| T04 | Verify JSON/flat secret precedence and real provider credential rotation without losing existing data, including rollback. |
| T05 | Capture browser and server egress during signup, mail, calendar, calls and all agents; confirm allowed same-origin/provider traffic and absence of unintended hosted-Macro/analytics traffic. |
| T06–T09 | Exact-owner employee activation and mailbox ownership; verified provider readiness before ordinary login; external two-way delivery; durable initial/incremental JMAP cursor under failure; attachment size, URL and ACL checks. |
| T10–T12 | Invitation/RSVP, RRULE exception and DST transitions, searchable event data and exactly one reminder after retries/restart. |
| T13–T14 | Canvas import, persist and reopen without unsafe URL protocol; two editors converge across offline/reconnect, and per-user permission revocation prevents later API/WS writes and unauthorized journal replay. |
| T15 | Inspect twelve specified Russian UI states including login, onboarding, Mail, Calendar, Canvas and Agents on actual browser/mobile surfaces; keyboard/focus, reduced motion, readable compact typography and loaded Rox font. |
| T16 | Owner-only install branding publish/rollback with durable ordered versions, SVG sanitization and reactive anonymous login/title/favicon; deny cross-org writes. |
| T17–T19 | Two-network call/screen-share, unanimous persisted recording/STT consent, stopping on revoke, traceable summary, and immediate room/media access revocation including previously issued tokens/edge URLs. |
| T20–T23 | Run each of nineteen agent profiles with real tool outcomes; recover durable routing after restart and manual edit; prove isolation/approvals, opt-in automation and reliable stop. |
| T24 | Measure resource/load/recovery on the final deployable installation with exact revision and failure/restart evidence. |

Each gate needs happy and relevant failure-path evidence against the same deployed revision. A focused unit test or isolated candidate is useful engineering evidence but is not an acceptance pass. No final T01–T24 gate is currently claimed passed.

## Trust and delivery constraints

The upstream `macro-inc` remote and the user's unrelated CTN main changes are not an authorized scratch area. Integrate only reviewed, tested changes on a private branch; merge into the owner's tree through the established backup/CAS safety route after the failed Fusion work is reconciled and all required corporate paths are demonstrably usable. Never publish provider secrets or substitute guessed organization/domain/KMS identifiers.
