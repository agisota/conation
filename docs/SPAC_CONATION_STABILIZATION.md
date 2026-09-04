# SPAC: Conation stabilization

**S**pecification · **P**lan · **A**rchitecture · **C**ontracts

Normative companion to [PRD_CONATION_STABILIZATION.md](./PRD_CONATION_STABILIZATION.md).
Agents execute **Contracts**; they do not invent extra scope.

Base: `conation/main` @ current HEAD. New branches: `conation/w-<slice>`.
Worktrees: `/root/macro-w-<slice>`. Skip formatters, clippy, vite build, and
workspace tests inside a slice. Parent verifies after merge.

## S — Specification

### S1 Documentation

| ID | File | Must say | Must not say |
| --- | --- | --- | --- |
| S1.1 | `docs/LOCALIZATION.md` | `User.locale` exists; `PATCH /auth/user/locale` from `setLocale`; browser `conation-locale`; remaining gap is async fan-out (digest/push/invite) per **recipient** | locale is not in DB |
| S1.2 | `infra/selfhost/README.md` §Почта | Signup provisions Stalwart `UserProvider::Stalwart`; JMAP body/flags/attachments/send exist on this tree; Gmail is optional; internet MX/DKIM unsupported; MinIO not wired as app S3 | web mail supports only Gmail; Stalwart is not an app backend |
| S1.3 | `docs/SELF_HOST_STALWART_MAILBOX_AUDIT_RU.md` | Support mailbox recipe still valid; composition root **does** create Stalwart links at init; remaining: public DNS/TLS/relay | Stalwart links never appear in Conation inbox |

### S2 Frontend i18n (semantic keys only)

Catalogs: `apps/web/src/lib/i18n/locales/{en,ru}.json`. Parent seeds keys.
Implementations call `t(key)`.

| Key | en | ru |
| --- | --- | --- |
| `soup.crm.stage.lead` | Lead | Лид |
| `soup.crm.stage.qualified` | Qualified | Квалификация |
| `soup.crm.stage.demo` | Demo | Демо |
| `soup.crm.stage.trial` | Trial | Пробный период |
| `soup.crm.stage.negotiation` | Negotiation | Переговоры |
| `soup.crm.stage.customer` | Customer | Клиент |
| `soup.crm.stage.churned` | Churned | Отток |
| `property.boolean.true` | True | Да |
| `property.boolean.false` | False | Нет |
| `property.editor.noProperty` | No {property} | Нет: {property} |
| `property.editor.addAria` | Add {property} | Добавить «{property}» |

`getPropertyOptionLabel` stays English (CRM stage matching). Display uses
`localizedPropertyOptionLabel` (extend `PROPERTY_OPTION_I18N_KEYS` for STAGE
ids). `TASK_STATUS_OPTIONS[].label` may stay English stored values.

SelectEditor placeholders: use existing `property.editor.setValuePlaceholder`
/ `addValuePlaceholder` / `clearAllValues`. Do not add `auto.*`.

### S3 Mail copy

`GmailReauthenticationPrompt` already filters `UserProvider.GMAIL`. Other
connect-Gmail empty states must skip when any link `provider === 'STALWART'`
exists.

### S4 Ports (re-implement on current main, do not cherry-pick old snapshot)

| Intent | Source commit | Target files |
| --- | --- | --- |
| SMTP relay | `81711837cb` | `crates/ses_client/**`, `services/authentication_service/src/main.rs` |
| Notification SMTP | `fab44b5640` | `crates/notification/src/outbound/email.rs`, `services/notification_service/**` |
| S3 endpoint isolation | `d01ad31c84` | `crates/conation_aws_config/**`, listed document/call S3 constructors, `xtask_local` env layer |
| Self-host smoke | `a8c95d146a` | `tooling/just/selfhost.just`, `tooling/scripts/selfhost-smoke.sh` |
| Rebrand contract | `d2ae9d575d` | `apps/web/scripts/rebrand-contract.test.ts` |
| Auth locale fallback | `f0e385c825` | `authentication_service` generate_email_link |
| i18n reset | `f548a68ee2` | `apps/web/src/lib/i18n/index.ts` + test |

Read the source commit in `/root/macro` (`git show <sha>`) and rewrite against
current files. Do not checkout those old branches in the slice worktree.

### S5 UX

- Browser prompt `notifications.browserPrompt.*`: persist dismiss in
  user-scoped localStorage; do not re-show same session after Hide.
- Getting-started mobile card: hide or mark unavailable; no fake store URL.

## P — Plan

1. Parent writes PRD/SPAC and seeds catalog keys (this commit).
2. Parallel topic branches (table C1). No slice runs vite/clippy/full test.
3. Parent reviews diffs, merges non-conflicting branches to `conation/main`.
4. Later (not this batch): internet mail DNS, MinIO production, Pulumi.

## A — Architecture

- i18n: `@app/lib/i18n` only. `localizedPropertyOptionLabel` is the display
  adapter for system option UUIDs.
- Mail: `UserProvider::Stalwart` already in email_service init; ports add
  SMTP transport for **transactional** mail, not a second JMAP stack.
- AWS: one `LOCAL_AWS_URL` today. S3 isolation adds a dedicated S3 endpoint
  env via `conation_aws_config` without pointing SQS/Dynamo at MinIO.
- Docs: Russian operator docs; no secrets.

## C — Contracts

### C1 Branch / worktree / files (exclusive write)

Agents MUST NOT edit files outside their row. MUST NOT edit
`apps/web/src/lib/i18n/locales/*.json` unless the row says so (parent seeded).

| Slice | Branch `conation/w-*` | Worktree `/root/macro-w-*` | Write set |
| --- | --- | --- | --- |
| docs-localization | docs-localization | docs-localization | `docs/LOCALIZATION.md` |
| docs-selfhost | docs-selfhost | docs-selfhost | `infra/selfhost/README.md` |
| docs-stalwart | docs-stalwart | docs-stalwart | `docs/SELF_HOST_STALWART_MAILBOX_AUDIT_RU.md` |
| docs-prd-index | docs-prd-index | docs-prd-index | `docs/README.md` or nearest docs index if it lists docs; else skip if no index |
| i18n-stages | i18n-stages | i18n-stages | `apps/web/src/features/property/utils/formatting.ts`, `apps/web/src/features/property/localization.test.ts` |
| i18n-property-editor | i18n-property-editor | i18n-property-editor | `apps/web/src/features/property/editors/popover/SelectEditor.tsx`, `apps/web/src/features/property/extractors/PropertyAddButton.tsx` |
| i18n-boolean | i18n-boolean | i18n-boolean | `apps/web/src/features/property/utils/formatting.ts` **CONFLICT with i18n-stages — stages owns formatting.ts; boolean is IN stages slice** |
| mail-copy | mail-copy | mail-copy | Gmail/Stalwart empty-state TSX under `apps/web/src/lib/core/email-link` and `apps/web/src/features/setup` (no locale json) |
| notif-banner | notif-banner | notif-banner | browser prompt component under `apps/web/src/features/notifications` |
| getting-started-mobile | getting-started-mobile | getting-started-mobile | `apps/web/src/features/getting-started/**` |
| port-smtp | port-smtp | port-smtp | `crates/ses_client/**`, `services/authentication_service/src/main.rs` |
| port-notif-smtp | port-notif-smtp | port-notif-smtp | `crates/notification/**`, `services/notification_service/**` |
| port-minio | port-minio | port-minio | `crates/conation_aws_config/**`, call/documents S3 files from S4, `xtask_local` env_layer |
| port-smoke | port-smoke | port-smoke | `tooling/just/selfhost.just`, `tooling/scripts/selfhost-smoke.sh` |
| port-rebrand-test | port-rebrand-test | port-rebrand-test | `apps/web/scripts/rebrand-contract.test.ts` |
| port-auth-locale | port-auth-locale | port-auth-locale | authentication_service generate_email_link + test |
| port-i18n-reset | port-i18n-reset | port-i18n-reset | `apps/web/src/lib/i18n/index.ts`, `apps/web/src/lib/i18n/index.test.ts` |

**Correction:** `i18n-boolean` is not a separate writer. Boolean formatting is
part of `i18n-stages` (only writer of `formatting.ts`).

### C2 Invariants

- `SQLX_OFFLINE` unset; no hand-edit `.sqlx`.
- Env vars via `macro_env_var` / existing typed config, never `std::env::var`
  in new Rust.
- No secrets in git.
- Commit message: `fix|feat|docs|test(<scope>): …`
- One commit per slice.

### C3 Acceptance per slice

- Diff limited to write set.
- Docs slices: grep the file for forbidden phrases in S1.
- i18n-stages: `localizedPropertyOptionLabel(STAGE.LEAD)` returns Russian
  after `setLocale('ru')` in existing localization.test.
- Ports: unit tests that already exist in the source commit are ported and
  would pass; agent does not run them if they need Docker, but must compile
  logically.
- Agent skips `vite build`, `cargo test` workspace, `just clippy`.
