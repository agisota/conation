# Conation operator and engineering docs

Index for files under `docs/`. This is the in-repo operator/engineering
catalog. It is not the Mintlify product site (`apps/docs/`).

Source of truth for **what is still open** after the stabilization merges is
the pair below, plus git on `conation/main`. Older self-host or mail notes
that contradict these two are stale.

| Doc | Role |
| --- | --- |
| [PRD_CONATION_STABILIZATION.md](./PRD_CONATION_STABILIZATION.md) | Remaining product goals after rebrand, Stalwart signup, and task board |
| [SPAC_CONATION_STABILIZATION.md](./SPAC_CONATION_STABILIZATION.md) | Spec, file ownership, and acceptance for that PRD |

Topic branches `conation/w-*` from that SPAC are already merged into
`conation/main`. Do not re-open them unless git shows unique commits.

## Run the stack

| Doc | Role |
| --- | --- |
| [RUNNING_LOCALLY.md](./RUNNING_LOCALLY.md) | Web build, local loop, standalone/Tauri artifact |
| [../infra/selfhost/README.md](../infra/selfhost/README.md) | Supported single-host baseline vs unsupported internet production |
| [CLOUD_STORAGE.md](./CLOUD_STORAGE.md) | Service/crate layout for the storage backend |

Local app: `http://localhost:3000/app`. Proxy: `8090`. This is a development
baseline (LocalStack/Nix/Docker), not a public MX/DKIM/Pulumi cutover.

## Mail, identity, locale

| Doc | Role |
| --- | --- |
| [LOCALIZATION.md](./LOCALIZATION.md) | `User.locale`, `PATCH /auth/user/locale`, browser `conation-locale`; remaining gap is async fan-out (digest/push/invite) per recipient |
| [SELF_HOST_MAIL_IDENTITY.md](./SELF_HOST_MAIL_IDENTITY.md) | Stalwart inbox at `/email/init` vs transactional From/support identity |
| [SELF_HOST_STALWART_MAILBOX_AUDIT_RU.md](./SELF_HOST_STALWART_MAILBOX_AUDIT_RU.md) | Support mailbox recipe; links are created at init; public DNS/TLS/relay still unsupported |
| [self-hosting-support-accounts.md](./self-hosting-support-accounts.md) | `pythia@conation.dev` support channel accounts |
| [CONATION_INTEGRATIONS_RU.md](./CONATION_INTEGRATIONS_RU.md) | `conation.dev` secret *names* and public URLs (no secret values) |

Gmail is an optional Google integration. Signup provisions a Stalwart mailbox.
Do not document the inbox as Gmail-only.

## Product identity

| Doc | Role |
| --- | --- |
| [REBRAND_CONATION.md](./REBRAND_CONATION.md) | Public Conation IDs vs leftover internal `Macro` matches |
| [TZ_ONBOARDING_BRAND_RU.md](./TZ_ONBOARDING_BRAND_RU.md) | Live-app onboarding/brand notes (2026-09-02 snapshot) |
| [EXTERNAL_DEPENDENCIES_RU.md](./EXTERNAL_DEPENDENCIES_RU.md) | Clean-source build must not fetch `macro-inc` artifacts |
| [GITHUB_MIRROR_RU.md](./GITHUB_MIRROR_RU.md) | How to publish git refs to the fork (issues/PRs are not git objects) |

## Other engineering notes

| Doc | Role |
| --- | --- |
| [STYLE_GUIDE.md](./STYLE_GUIDE.md) | `just check` review rules |
| [CURSOR_AGENT_TRANSPORT.md](./CURSOR_AGENT_TRANSPORT.md) | Cursor-managed agent session transport as built |
| [STARTER_CONTENT_ASSETS.md](./STARTER_CONTENT_ASSETS.md) | Media in seeded starter documents |
| [PROPERTY_TARGET_ENTITY_TYPE_PLAN.md](./PROPERTY_TARGET_ENTITY_TYPE_PLAN.md) | Plan only — no schema change from that doc |

Asset inventories live under [`docs/assets/`](./assets/).

## Product documentation site

End-user/product pages: [`apps/docs/README.md`](../apps/docs/README.md)
(Mintlify). Preview is local and independent of public DNS/TLS.

## Still out of this catalog

Internet DNS/TLS/DKIM, production MinIO as app S3, APNS/FCM, Pulumi org
migration, and mass `auto.*` i18n are non-goals of the stabilization PRD.
Locale persistence in the browser and `User.locale` are shipped; notifying
other async mail/push paths when locale changes is the remaining i18n gap.
