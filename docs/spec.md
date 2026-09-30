# Conation local launch and repository consolidation

## Objective

Make `agisota/conation` the canonical repository for the Russian-first Conation
product while retaining the CTN integration branches and pull requests. Provide
a local browser launch whose authentication, when enabled, stays on operator
services and delivers sign-in mail to a local mailbox.

## Acceptance

1. The canonical repository's default branch contains the Conation product
   surface and its Russian-first locale catalog. The previous repository and
   its pull requests remain reachable under an explicit legacy name; all CTN
   branches and existing pull-request bases remain available.
2. Built-in theme identifiers already stored in user preferences remain valid.
   The dark theme renders a localized Conation label, and an unknown or
   transitional identifier cannot crash the welcome screen.
3. The local web client uses local service endpoints for authentication. A
   visible welcome screen or an HTTP 200 response alone does not establish a
   working sign-in.
4. A complete local sign-in check requires the auth service, FusionAuth,
   database, local mail transport, and a send → receive → redeem test using a
   disposable address. A local SMTP/JMAP check is recorded separately.
5. Full localization requires a user-visible UI audit, catalog and ICU checks,
   locale chosen per recipient for background deliveries, bilingual mail and
   push snapshots, and a browser language-switch smoke test.

## Compatibility and safety

- Keep the persisted `Macro Dark` theme ID while displaying the localized
  Conation name. Accept the transitional `Conation Dark` value written by an
  earlier local preview.
- Keep the existing CTN pull-request base branches and prior Conation history.
- Bind development web and mail ports to loopback. Never use the hosted Macro
  development backend as proof of a local Conation sign-in.
- Keep local mail credentials outside Git; do not use a real personal address
  for the sign-in smoke test.
