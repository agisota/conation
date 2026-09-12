# PRD: Conation stabilization (post-handoff)

Status: executable. Source of truth is git on `conation/main` plus live
`https://app.conation.dev`, not older self-host/mail docs.

Product: **Conation** (standalone, Russian-first). This PRD covers remaining
work after self-host scaffolding, rebrand, i18n scaffold, Stalwart mailbox
signup, and task board/timeline.

Companion: [SPAC_CONATION_STABILIZATION.md](./SPAC_CONATION_STABILIZATION.md)
(specification, plan, architecture, branch contracts).

## Problem

Three original initiatives look “done” in commits and operator docs, but:

1. Operator docs still describe Gmail-only inbox and missing `User.locale`
   after those features shipped.
2. A Conation mailbox exists at signup; internet deliverability, SMTP relay,
   and calendar-without-Google do not.
3. Self-host is a local/dev baseline (LocalStack), not a production topology.
4. Russian UI is incomplete on CRM stages, property editors, and secondary
   surfaces.
5. Parallel worktrees (`conation/parallel-*`) were never integrated
   (ports landed on `conation/w-port-*` and merged; do not cherry-pick the
   orphan `parallel-*` snapshots).
6. Rebrand/history topology (`main` vs `clean-history` vs `overlay`) —
   **resolved:** product line is `conation/main` (crate rename). Overlay
   keep-`macro_*` and orphan `clean-history` are skip/archive. Contract:
   [History topology](./REBRAND_CONATION.md#history-topology).

Git topology is no longer ambiguous. Remaining operator-facing gaps are
the requirements below.

## Goals

- Docs match running code.
- Visible Russian on tasks, CRM, properties, mail empty-states.
- Stalwart mailbox remains the default inbox; Gmail is optional Google
  integration, not a fake reconnect prompt.
- Parallel-branch patches that still apply are ported onto `conation/main`
  as separate topic branches.
- Self-host remaining AWS boundaries stay explicit; MinIO S3 isolation and
  smoke probe land as code, not as a production claim.

## Non-goals

- Zero remaining `Macro` string matches.
- Renaming `macrodb`, Kafka `macro.*` topics, or JWT stored HTML markers.
- Mass `auto.*` i18n extraction.
- Declaring internet production self-host, APNS/FCM, or Pulumi `macro-inc`
  replacement in this slice.
- History rewrite of `conation/main`.

## Users

| User | Need |
| --- | --- |
| New Conation user (RU) | App, tasks, mail, CRM labels in Russian; mailbox without Google |
| Operator | Accurate runbooks; no LocalStack/MinIO confusion |
| Maintainer | Topic branches with file ownership; no 10 stale worktrees as status |

## In-scope requirements

### R1 Docs truth
Update `docs/LOCALIZATION.md`, `infra/selfhost/README.md`,
`docs/SELF_HOST_STALWART_MAILBOX_AUDIT_RU.md` so they describe current
Stalwart signup/JMAP, `User.locale` + `PATCH /user/locale`, and remaining
unsupported internet-mail/MinIO/production items.

### R2 Visible i18n
CRM stage labels, property select empty/add/boolean, Stalwart-aware mail
copy. Use semantic keys already listed in SPAC. English source catalog
remains canonical; Russian is runtime default.

### R3 Mail product honesty
No “Reconnect Gmail” for Stalwart links (already shipped). Empty/connect
copy must not demand Gmail when a Conation mailbox exists. Do not claim
public MX/DKIM done.

### R4 Port surviving parallel patches
Re-implement onto branches from current `conation/main`:

- SMTP relay (`ses_client`)
- Notification outbound SMTP
- S3 endpoint isolation (`conation_aws_config`)
- Self-host smoke script
- Rebrand contract test
- Auth verification-email locale fallback
- i18n locale reset test

### R5 UX hygiene
Browser notification prompt dismiss persistence. Getting-started “Mobile”
must not pretend a store listing exists.

## Out of scope this round

Internet DNS/TLS/DKIM, CalDAV, push, Pulumi org migration, Tauri
notarization, agent GitHub-proxy, orphan-history cutover.

## Success

- Live RU UI: stages and property boolean/select chrome translated.
- Docs no longer say inbox is Gmail-only or locale is unpersisted.
- Each ported patch has a topic branch from current main and targeted tests
  in that crate/script.
- `conation/main` stays greenfield public IDs (`conation|`); no `macro|`
  principals.

## Risks

- Stale docs cause wrong operator actions (mail/MinIO).
- Parallel file overlap on `en.json`/`ru.json` and `formatting.ts`.
- Porting old parallel commits that were based on `2e829e7d1a` onto
  `98382b59b8+` will not cherry-pick cleanly; re-implement intent.
