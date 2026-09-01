# Macro to Conation rebrand contract

This document is a migration guardrail for the current repository, not a
certificate that the rebrand is complete. `Conation` is the target product
display name. A remaining `Macro` match is not automatically a defect: some
matches are persisted data, wire contracts, native application identities, or
third-party provenance.

The self-host topology and remaining cloud boundaries are maintained in the
[self-hosting status](../infra/selfhost/README.md). This document only covers
the naming and compatibility implications of that deployment.

## Decision rules

| Class | Examples in the current tree | Rule |
| --- | --- | --- |
| Product display | README copy, web metadata, manifest name, window title, visible email/UI copy | Use **Conation**. Localize visible copy rather than embedding a second English spelling. Asset artwork still needs visual review even when its filename is safe to change. |
| New deployment-owned name | A new image tag, a new greenfield Compose project, or an experimental volume with no predecessor | A Conation name is safe only when no deployed resource, persisted volume, automation, or external consumer already refers to the old name. |
| Private implementation name | `publish = false` Rust crates and private workspace packages | It may be renamed with language-aware references, lockfile regeneration, and targeted builds. There is no requirement to rename every internal type, module, or local variable merely because it says Macro. |
| Compatibility contract | Database identifiers, serialized fields, API paths, JWT claims, cookies, headers, identifier prefixes, HTML markers, topics, queues, URLs, issuers, package exports, and native app IDs | Preserve the current value until a versioned migration or a tested compatibility window exists. A source rename alone is unsafe. |
| Historical or external name | Dependency repository owners, published release links, historical changelogs | Keep it unchanged unless the external object actually moved and a verified replacement exists. Do not rewrite history or provenance. |
| Uncertain match | A name whose consumers or persistence are not demonstrated | Mark it audit-required. Do not infer safety from spelling or file location. |

`tooling/scripts/rebrand.sh` is now a read-only guard that points here. Its
former broad replacement table was removed because indiscriminate textual
replacement of identifiers and domains is not a valid migration mechanism for
the compatibility classes above.

## What can use Conation now

The following are product-owned Conation surfaces in the current tree:

- Root marketing copy and links in `README.md`.
- Web metadata in `apps/web/index.html` and install metadata in
  `apps/web/public/manifest.json`.
- The web package name `@conation/web` and the private workspace packages
  `@conation/collaboration` and `@conation/observability`.
- Private, unpublished Rust crate names such as `conation_auth`,
  `conation_db_client`, `conation_env_var`, and `conation_event_topics`.
- Rebuilt local image tags such as `conation-local-rust-services:dev`.
- Greenfield experimental self-host resources such as the `conation_*` MinIO,
  Stalwart, and Caddy volumes in `docker/docker-compose.selfhost.yml`.

These names are build or display surfaces, not evidence that their underlying
protocols were renamed. In particular:

- `packages/lexical-core/package.json` is not marked `private`; its current
  `@conation/lexical-core` name needs a registry and downstream-consumer audit.
- The supported local Compose project deliberately remains `macro`, while
  application image branding is Conation. Changing the project name would
  create different networks, containers, and volume attachment behavior.
- An existing Docker volume, bucket, topic, Pulumi resource, or secret is not
  greenfield merely because a Compose overlay now has a Conation name.

## Intentional Macro compatibility inventory

This is the concise allowlist of important Macro-shaped contracts found in the
current tree. It is categorical rather than a promise that every individual
resource has already been inventoried.

| Surface | Current canonical values and evidence | Migration policy |
| --- | --- | --- |
| Main database | Database `macrodb`; tables such as `macro_user`, `macro_user_info`, `macro_user_email_verification`, and `macro_user_links`; columns such as `macro_user_id` and `macro_prompt_id`; migrator constant `MACRO_DB_MIGRATIONS` | Keep. Any replacement needs additive SQL migrations, dual-compatible application code, backfill/verification, and a later contract migration. Never rename migrations or edit SQLx cache files by hand. |
| User identity | The persisted/public ID form `macro\|email@example.com`; `MacroId`, `MacroUserId`, and related parsers | Keep the wire value. Type or symbol names may gain aliases, but changing the prefix requires dual parsers and a complete foreign-key, payload, document, and index migration. |
| Authentication API | `GET /jwt/macro_api_token`, response field `macro_api_token`, claims `macro_user_id`, `macro_organization_id`, and `root_macro_id` | Keep canonical output. Version any replacement and regenerate SDKs only after old clients remain supported for the declared window. |
| Auth browser/key material | Cookies `macro-access-token` and `macro-refresh-token`, header `x-macro-refresh-token`, JWK key IDs such as `macro_access_token_{env}`, and key header `kid: macro` | Keep until cookie coexistence, logout/refresh behavior, JWKS rotation, and token TTLs are tested. Secret names are lookups, not display copy. |
| Environment interface | Operational names including `MACRO_ENV`, `MACRO_ENV_FILE`, `MACRO_API_TOKEN_*`, `MACRO_TAURI_*`, `MACRO_USER_ID`, `MACRO_BOT_TOKEN`, and `MACRO_STACK_SNAPSHOT_DIR` | Treat as operator API. Add Conation aliases with precedence and conflict detection before deprecation; never silently read a different secret. Rust access must continue through the typed environment macros. |
| Persisted editor/email HTML | Search emphasis tag `<macro_em>`; quote class `.macro_quote`; signature class `.macro-email-signature`; email metadata such as `Macro-In-Reply-To` | Keep canonical writes. A rename requires tolerant readers across web, backend, exporters, sanitizers, and search plus stored-content/index backfill. |
| Kafka | Topic literals `macro.documents`, `macro.soup`, `macro.projects`, `macro.properties`, `macro.teams`, `macro.channels`, `macro.bots`, `macro.calls`, `macro.email`, `macro.webhooks`, `macro.mentions`, `macro.notifications`, `macro.chats`, `macro.calendar`, and `macro.agent_sessions` | Treat as durable broker addresses. Use dual publish/consume or a broker migration, then drain and verify old consumer lag before removal. |
| Queues and object storage | Existing queue/bucket names and URLs, including `macro-email-attachments`, `macro-call-recording-*`, and `macro-preview-assets-dev`; override variables such as `OVERRIDE_*_QUEUE` | Treat all literal resource names as lookups even when they do not contain Macro. Migrate with copy/replication, policy updates, dual endpoints, and rollback. |
| Pulumi/AWS state | Pulumi organization/stack selectors such as `macro-inc/{environment}`, stack references, resource URNs, certificates, secret keys, ARNs, and DNS aliases | Preserve until resources are imported or aliased into a reviewed replacement state. Text replacement can orphan live infrastructure or create duplicates. The AWS/self-host support boundary is in the self-hosting status document. |
| Domains and auth origins | Deployed `*.macro.com` service URLs, CORS entries, FusionAuth issuers, OAuth callbacks, app links, signed-link hosts, and preview domains coexist with newer `*.conation.dev` values | Audit-required and currently mixed. Migrate with DNS/TLS plus redirects, dual CORS/app-link association, OAuth-provider registration, and issuer/audience compatibility. A hostname inside a JWT is an identity value, not copy. |
| Native application identity | `com.macro.app.prod`, app group `group.com.macro.app.prod`, custom scheme `macro://`, generated Android/iOS package paths, entitlements, and existing App Store listing | Keep for the existing application lineage. Product/window display may say Conation, but bundle IDs and app groups control upgrades, keychain/shared storage, extensions, push, and store identity. |
| Local persisted deployment state | Compose project/network identity `macro` and core volumes `macro_postgres_data`, `macro_redis_data`, `macro_opensearch_data`, and `macro_kafka_data` | Keep so existing local databases and indexes remain attached. Earlier experimental `conation_*` volumes are never adopted, copied, renamed, or deleted automatically; inspect and migrate them explicitly if their contents matter. |
| First-party bots | Stable bot UUIDs, principal IDs, handles `macro`, `macro-new`, and `macro-system`, and historical bare-UUID recognition | Keep IDs and accepted handles. Display names can become Conation only after mention rendering, prompts, permissions, notifications, and old content are tested. |
| Persisted theme values | Built-in IDs and stored names `Macro Dark`, `Macro Light`, and `Macro-Gruvbox` | Keep serialized values so existing preferences and custom-theme inheritance resolve. Render localized Conation-facing labels through a display mapping instead of changing the stored ID. |
| Starter-document identity | Deterministic UUID namespaces, source object keys, and legacy template lookups containing Macro | Keep seeds and storage lookups to avoid changing document identities or breaking initialization. Split display content from source identity before migrating visible legacy templates. |
| Source/API symbols | Exported names such as `MacroUserId`, `MacroId`, and `MacroApiToken`; internal names such as `MacroDB` | Internal-only symbols may remain indefinitely. Exported symbols need aliases and a semver/deprecation plan before removal. Do not mechanically rename types or generated schemas. |
| Upstream and dependencies | `github.com/macro-inc/tauri-plugins`, `github:macro-inc/pdf.js`, and `github.com/macro-inc/rs-libreoffice-bindings`; the upstream `macro-inc/macro` repository and historical pull/release links | These identify real external objects and pinned revisions. Keep until a mirror/fork is published, verified, and deliberately repinned. Historical changelog provenance remains unchanged. |
| CLI/release identity | Binary/release name `macrod`, artifact names, installer/update channels, and repository download URLs | Audit-required. Preserve aliases and update-channel compatibility before changing the executable or archive name. |

The private package `@macro-inc/infra-web-app` is different from an external
dependency: its package scope is locally changeable, but its scripts select the
external Pulumi organization `macro-inc`. Those two strings must not be migrated
as one operation. Likewise, old `@macro-inc/collaboration` references in source
documentation must be checked against published consumers; the current
workspace package itself is `@conation/collaboration`.

## Compatibility aliases already present

The preferred pattern during this recovery is canonical-write,
tolerant-read:

- JWT decoding accepts the accidental transitional fields
  `conation_user_id`, `conation_organization_id`, and `root_conation_id`, while
  serialization continues to emit the established Macro claim names.
- Email signature placement recognizes `.conation_quote` as a transitional
  input alias while canonical editor content continues to use `.macro_quote`.
- Bot identity checks accept historical bare bot UUIDs while new principals use
  the canonical `bot|<uuid>` representation.

These aliases must have focused tests and telemetry before removal. They do not
authorize a second wave of Conation-shaped wire values.

## Required migration patterns and removal criteria

| Contract | Required compatibility window | Alias/legacy removal gate |
| --- | --- | --- |
| Database/table/column | Expand schema, deploy code that reads both and writes a canonical value, backfill, verify constraints and rollback, then contract in a later migration | Every supported deployment has applied and verified the backfill; old binaries are outside support; restore and rollback drills pass; SQLx metadata was regenerated by the repository procedure. |
| HTTP/GraphQL/OpenAPI | Add a versioned or aliased endpoint/field, keep old clients working, regenerate SDKs, and observe usage | Usage of the old contract is zero for the declared client support window and integration/contract tests cover both sides. |
| JWT/cookie/header/key | Accept both during rollout; choose one canonical serializer; rotate keys without reusing a key ID; account for maximum access and refresh lifetimes | No supported client emits the old form, telemetry is zero beyond maximum lifetime, refresh/logout works across the boundary, and emergency rollback keys remain available. |
| Persisted IDs/HTML/search | Deploy tolerant readers first, backfill durable data and OpenSearch indexes, then switch canonical writers | Repository-wide storage/index sampling is clean, old document/email round trips pass, and the oldest supported client can still read migrated content. |
| Topic/queue/bucket | Provision the destination, mirror or dual-write, run consumers side by side, reconcile counts/DLQs, and preserve rollback | Old backlog and consumer lag are zero, retention has elapsed, policies/events/schedules point to the new resource, and backup/replay has been tested. |
| Domain/URL/OAuth | Serve both domains with valid TLS, redirect only where semantics permit, register both callback/app-link origins, and accept planned issuers | Old-link traffic is below the agreed threshold for the support window; OAuth providers, CORS, signed links, email links, app links, and token validation pass on supported clients. |
| Native bundle/app group/scheme | Usually retain bundle and app-group IDs permanently; add a new URL scheme or universal-link host alongside the old one | Remove a scheme/host only after the minimum supported native version no longer emits it and persisted/shared links are covered. Do not remove the existing bundle/app-group identity from the same store lineage. |
| Package/crate/export | Publish or expose a compatibility package/export, update all workspace and known downstream consumers, and regenerate locks | Registry/download and downstream-reference audit is complete; the deprecation window elapsed; reproducible builds pass without the old alias. |
| Pulumi/resource name | Use Pulumi aliases/imports and explicit provider-side rename/copy procedures; review dependencies and deletion protection | Preview shows no unintended replacement/deletion, state backup exists, dependent stacks resolve the new outputs, and rollback has been exercised. |

## Known gaps requiring audit

The following current-tree inconsistencies prevent a claim of a complete
rebrand:

- The web localization migration now covers the principal application shells,
  settings, authentication/onboarding, calendar, channels, editor, AI,
  properties, activity, and entity workflows with semantic English/Russian
  messages. A bounded audit of older feature-specific hardcoded copy is still
  required, especially for secondary block views and developer-only surfaces;
  fixtures and protocol strings must not be translated merely because they
  contain English or Macro text.
- Backend Russian rendering is intentionally narrow. The authenticated custom
  verification-link email negotiates `Accept-Language`, while recipient locale
  is not yet persisted or propagated through digest, invite, notification,
  push, and multi-recipient fan-out paths. Those paths retain a coherent
  English fallback rather than guessing the sender's locale.
- Native display metadata now says Conation, while the Tauri config, generated
  Android/iOS projects, app groups, callbacks, and runtime navigation
  deliberately retain `macro://`, `*.macro.com`, and `com.macro.app.prod` for
  upgrade compatibility. Adding Conation deep links or domains still requires
  verified association files, dual registration, and a supported-client
  removal window.
- Infrastructure service URL helpers contain Conation domains while many
  Pulumi stack configs, FusionAuth issuers, CORS lists, and native clients still
  contain Macro domains. The supported environments need an explicit domain
  matrix and rollout order.
- Static asset and symbol filenames still include Macro. Most filenames can
  remain internal; visible artwork and accessible labels require review.
- First-party bot display names use Conation, while their stable UUIDs,
  principal IDs, handles, and persisted mentions deliberately remain Macro
  compatibility contracts. Any future identity migration still needs the
  compatibility window described above.
- Legacy starter-document templates still contain historical Macro copy and
  are coupled to stable object-storage source names and deterministic ID seeds.
  Split source identity from rendered display content before changing them;
  never alter the seeds or storage lookups as cosmetic rebranding.
- The documentation application contains a mixture of stale product copy,
  historical release links, live Macro endpoints, and newer Conation links.
  Each link must be classified as redirect-required, historical, or erroneous.
- Repository guidance still refers to some pre-rename crate/tool names. Fixing
  those references is safe only after confirming the actual supported command
  and package name.

## Completion gate

A rebrand review should not target zero textual matches. It is complete only
when:

1. Every remaining Macro match is assigned to an allowlisted contract,
   historical/provenance class, or a tracked audit item.
2. Product display copy and assets say Conation in every supported locale and
   surface, including web, mail, notifications, desktop, and mobile.
3. Compatibility migrations have explicit owners, observation windows,
   rollback plans, and removal criteria.
4. Generated SDKs, native projects, lockfiles, SQLx metadata, and deployment
   state are regenerated only through their supported procedures.
5. Targeted frontend, Rust, database, native deep-link, and deployment tests
   pass for both canonical and compatibility paths.

Until those gates are met, reports should say that the Conation rebrand is in
progress and should list the intentional Macro compatibility identifiers above.
