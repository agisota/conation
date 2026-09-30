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

## Local authentication contract

- A named local stack may point both application SMTP and FusionAuth's
  passwordless template to an isolated local mail server. The operator chooses
  an exact SMTP hostname, TCP port, sender domain, and sender address through
  `CONATION_LOCAL_SMTP_HOST`, `CONATION_LOCAL_SMTP_PORT`,
  `CONATION_LOCAL_SENDER_BASE_ADDRESS`, and `CONATION_LOCAL_SMTP_FROM`. With
  these unset, the existing Mailpit defaults remain. Do not place external or
  private provider credentials in generated Compose, documentation, or Git
  history. Local generated files are ignored by Git and kept mode `0600`.
  These `CONATION_LOCAL_*` settings are read from the calling process: export
  them in the shell before `just stack up`. Supplying them only through
  `--env-file` is not supported.
- The authentication service accepts its instance-derived frontend origin,
  native Tauri/Capacitor origins, and one explicit loopback Vite preview port
  set by `CONATION_LOCAL_PREVIEW_PORT`. Do not use a wildcard origin. The
  current browser preview uses port `3004`. This port controls CORS; the
  passwordless `redirect_uri` travels in FusionAuth state, not in its OAuth
  authorized redirect list. Other OAuth redirects remain to be tested live.
- The local FusionAuth passwordless email has a Russian Conation subject,
  body, and sender label. Its fixed application and tenant IDs remain intact.
- Named-instance generated host port bindings are loopback only. The existing
  ROX mail server, containers, networks, and volumes are outside this stack.
- The local auth binary enables `return_passwordless_code`, which includes a
  one-time code in the HTTP response for development tooling. Keep this stack
  on the operator's loopback interface. Never publish or tunnel its auth API,
  proxy, FusionAuth, or mail ports as a cloud sign-in service.
- Acceptance for sign-in is a real request-code response from the local auth
  service, message readback from the local mailbox, code redemption in the
  current browser, then session refresh and logout. SMTP acceptance, a
  generated kickstart, or a reachable welcome screen alone do not meet it.
- At the current checkpoint, the isolated Stalwart SMTP-to-JMAP path,
  generated Compose syntax, and offline `xtask_local` compilation of the
  final source are verified. FusionAuth and the auth service are not running;
  disk space fell below 3 GiB during an earlier cold attempt. The end-to-end
  acceptance remains open until the binary and containers run and the browser
  flow passes.
- These environment choices are bootstrap settings for a fresh named stack.
  `stack update` does not reapply FusionAuth kickstart, and a preview-port-only
  change may not recreate the auth service. Recreate a disposable named stack
  deliberately; `stack up` resets that instance's volumes, so preserve any
  data first. Do not describe these settings as hot reloadable.
