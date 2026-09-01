# Localization architecture and status

English is Conation's source and fallback locale. Russian is the second
supported locale. Localization is a runtime concern: product copy stays in the
English catalog and is rendered through semantic keys rather than replacing
source code, identifiers, protocol values, or fixture data.

This document records the current contract and the remaining rollout boundary.
It is not a claim that every historical UI string or outbound notification has
already been translated.

## Frontend ownership

The canonical runtime is `apps/web/src/lib/i18n`. The similarly named
`lib/core/i18n` module is only a compatibility re-export; it must not acquire a
second catalog or locale state.

- Supported locale identifiers are `en` and `ru`.
- The browser resolves a locale from the persisted `conation-locale` value,
  followed by `navigator.language`/`navigator.languages`, then English.
- Selecting a locale persists it, updates the Solid signal, synchronizes
  `<html lang>`, and is propagated to other tabs through the storage event.
- The Account settings screen owns the current user-facing locale selector.
  The selection updates the running application without a reload; static UI
  registries expose locale-aware getters or resolve their labels at render time.
- Missing Russian messages fall back to the English source message. A key is
  rendered only when neither catalog contains it, making catalog defects
  visible during development.

New keys must be semantic and domain-owned, for example
`settings.account.language.label` or `auth.login.continue`. New `auto.*` keys
are prohibited. A translation call must never supply an identifier, enum,
route, URL, analytics value, API field, fixture value, or generated-client
constant.

The initial syntax-agnostic extraction has been retired: executable source and
both canonical catalogs contain no `auto.*` calls or keys. Reviewed semantic
catalogs now cover the application shell and common UI, account and team
settings, authentication/onboarding/setup, unified views, calendar, channels,
the Markdown editor, AI/agent surfaces, properties, companies, themes,
integrations, activity, sharing, contacts, invitations, and reminders. Older
feature-specific hardcoded copy is being migrated only after a syntax-aware
review; debug fixtures, protocol examples, and persisted values deliberately
remain literals when localization would change their meaning.

The runtime uses ICU MessageFormat for plurals and selects. Russian plural
behavior belongs in a single complete message rather than manually appended
word fragments. Dates, numbers, currencies, and relative times use the shared
locale-aware formatters in `lib/i18n`; feature code must not add new `en-US`
formatters.

## Request propagation

`safeFetch` adds the selected `Accept-Language` value to first-party application
origins unless the caller already provided one. It intentionally does not send
the header to arbitrary third-party URLs. Other HTTP transports must be audited
before backend localization can be considered universal.

The authentication service currently consumes this header for the
authenticated custom email-verification path. Locale negotiation and rendering
live in the transport-free `backend_i18n` crate; the Axum handler extracts the
raw header and the existing SES adapter only delivers the rendered result.
English is the backend fallback, and the HTML document language and accessible
copy match the selected locale.

## Backend boundary still open

Per-recipient Russian localization for asynchronous email, push, digest, and
invitation delivery is **unsupported in this release**. Only the authenticated
custom verification email has a locale-aware backend renderer. Do not describe
frontend catalog coverage as localization of those outbound channels.

Recipient locale is not yet persisted in MacroDB or carried by the asynchronous
notification model. Digest, invitation, push, and notification fan-out paths
often render content once and clone it to multiple recipients, so using a
sender's request locale would be incorrect. They remain English fallback until
the following additive rollout is implemented:

1. Add a locale preference to the existing `macro_user` compatibility schema
   through a generated SQLx migration; do not rename the table or `macro|` user
   identifiers.
2. Expose authenticated read/update endpoints and persist the browser choice.
3. Resolve locale per recipient behind a notification-domain port before
   rendering email or push content.
4. Carry locale through digest jobs and other asynchronous envelopes with a
   backward-compatible default.
5. Add native APNS localization resources or render per-recipient payloads;
   never reuse one localized body for a mixed-locale recipient set.
6. Configure externally owned FusionAuth and Loops templates separately.

Mail addresses such as `auth@macro.com` and `support@macro.com`, deployed
domains, metadata tags, and queue fields are compatibility/deliverability
contracts, not translatable brand copy. Their migration is governed by
`docs/REBRAND_CONATION.md`.

## Validation

Focused localization changes should include behavioral tests for representative
English and Russian output, catalog parity, fallback, ICU plurals/selects,
locale persistence, document language, and locale-aware date/number formatting.
The relevant top-level frontend checks are:

```bash
\cd apps/web
bunx vitest run --project i18n src/lib/i18n/index.test.ts
bun run type-check
bunx vite build -c vite.config.ts
```

The production build currently needs explicit heap headroom on this workspace
to finish chunk rendering; the bare command's exit status and the raised-heap
diagnostic must be reported separately rather than treating the diagnostic as
the mandated command.

Backend renderer tests are pure. Database-backed service tests must follow the
root `AGENTS.md` procedure with `SQLX_OFFLINE` unset. Any future locale SQL must
use an additive migration and `nix develop --command just prepare_db`; `.sqlx`
files are never edited by hand.
