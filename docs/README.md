# Conation docs

Operator and maintainer index. Product line is **`conation/main`**.

## Start here

| Doc | Use it for |
| --- | --- |
| [RUNNING_LOCALLY.md](./RUNNING_LOCALLY.md) | Local stack, ports, login |
| [REBRAND_CONATION.md](./REBRAND_CONATION.md) | Naming/compatibility contracts and [history topology](./REBRAND_CONATION.md#history-topology) (`overlay` / `clean-history` are skip) |
| [LOCALIZATION.md](./LOCALIZATION.md) | `User.locale`, browser `conation-locale`, remaining async fan-out |
| [../infra/selfhost/README.md](../infra/selfhost/README.md) | Self-host mail/S3 baseline (Stalwart signup, not Gmail-only) |
| [SELF_HOST_STALWART_MAILBOX_AUDIT_RU.md](./SELF_HOST_STALWART_MAILBOX_AUDIT_RU.md) | Stalwart links at init; remaining public DNS/TLS/relay |
| [SELF_HOST_MAIL_IDENTITY.md](./SELF_HOST_MAIL_IDENTITY.md) | Self-host identity vs Stalwart signup |
| [PRD_CONATION_STABILIZATION.md](./PRD_CONATION_STABILIZATION.md) | Remaining stabilization goals |
| [SPAC_CONATION_STABILIZATION.md](./SPAC_CONATION_STABILIZATION.md) | Slice contracts for that PRD |

## Also in this tree

| Doc | Use it for |
| --- | --- |
| [CONATION_INTEGRATIONS_RU.md](./CONATION_INTEGRATIONS_RU.md) | Gmail optional; Stalwart default inbox |
| [STYLE_GUIDE.md](./STYLE_GUIDE.md) | Engineering conventions |
| [CLOUD_STORAGE.md](./CLOUD_STORAGE.md) | Storage service notes |
| [CURSOR_AGENT_TRANSPORT.md](./CURSOR_AGENT_TRANSPORT.md) | Agent sandbox egress |
| [self-hosting-support-accounts.md](./self-hosting-support-accounts.md) | Support-account preflight |

Do not treat `conation/overlay` (keep `macro_*` crates) or `conation/clean-history` as the live product. Merge and branch from `conation/main` only.
