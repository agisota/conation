# Conation self-hosting status

Conation has a supported **local, single-host, no-managed-cloud baseline** for
development, evaluation, and operator smoke tests. It does not yet have a
supported Internet-facing production distribution. The production Pulumi
stacks remain AWS-specific.

This distinction matters: the local baseline exercises the product with
containers and AWS API emulation, while production self-hosting still needs
provider boundaries, hardening, backup/restore validation, and an upgrade
contract.

## Supported baseline

Nix is the only host prerequisite. Docker, Compose, `just`, Rust, and frontend
tools are supplied by the pinned development shell. From the repository root:

```bash
bash .cursor/infra.sh
bash .cursor/stack.sh
```

`stack.sh` calls `infra.sh` itself, so the second command is sufficient for a
full start. Running `infra.sh` separately is useful before DB-backed tests.
Neither command resets a healthy stack. Do not pass `--fresh` unless loss of
the local stack data is intentional.

The equivalent repository wrappers are:

```bash
nix develop --command just selfhost-infra
nix develop --command just selfhost-up
nix develop --command just selfhost-status --json
```

After a backend edit:

```bash
bash .cursor/rebuild.sh
```

Frontend edits hot-reload. Stop containers while retaining volumes with:

```bash
nix develop --command just selfhost-down
```

The default endpoints are the app at `http://localhost:3000/app`, the backend
proxy at `http://localhost:8090`, FusionAuth at `http://localhost:9011`, Mailpit
at `http://localhost:8025`, and LocalStack at `http://localhost:4566`.

### Standalone web and native clients

The production web build now defaults to the `standalone` client profile. It
derives every application API from the origin serving the page and does not
fall back to a managed `macro.com` service:

```bash
cd apps/web
bunx vite build -c vite.config.ts
```

Set `VITE_CONATION_OPERATOR_ORIGIN=https://conation.example` to bind a web
artifact to one operator origin, or leave the production default
`same-origin` so the same artifact follows its serving origin. The standalone
ingress contract is `/auth`, `/app/login`, `/pdf`, `/dss`, `/websocket`,
`/cognition`, `/connection-gateway`, `/notification`, `/static-file`,
`/unfurl`, `/contacts`, `/email`, `/image-proxy`, `/scheduled-action`,
`/agent-harness`, `/sync`, `/mcp`, `/ai-editing`, and `/i/ph`. WebSocket clients
use `ws:`/`wss:` with the same host and the `/websocket`,
`/connection-gateway`, or `/sync` path. An operator
must route every enabled path; an absent route fails at that feature instead of
redirecting traffic to Macro infrastructure.

Standalone source maps are off by default, which keeps the normal Vite build
below the observed Node heap spike. Set `VITE_CONATION_SOURCEMAPS=true` only
when the operator owns the resulting maps. The former managed deployment is
available solely as an explicit compatibility build with
`VITE_CONATION_CLIENT_PROFILE=hosted-legacy` or `just build-hosted-legacy`.

Native release builds use the same profile and default to
`https://conation.dev`:

```bash
cd apps/web
CONATION_OPERATOR_ORIGIN=https://conation.example just tauri-build-standalone
```

`CONATION_BUNDLE_UPDATE_BASE_URL` optionally selects a separate operator-owned
OTA bundle endpoint; its default is `<operator-origin>/auth/`.
`CONATION_TAURI_HTTP_ORIGINS` is an optional comma-separated list of additional
origins required for direct object URLs. The build validates all of these as
root HTTP(S) origins and rejects managed Macro hosts. It compiles the exact
operator host into the Tauri HTTP capability and universal-link allowlist;
custom domains must publish matching Apple/Android association metadata.
Standalone custom URLs use `conation://`. The old `macro://` scheme and Macro
app-link hosts are enabled only by `just tauri-build-hosted-legacy`.

This is a development topology, not a hardened host firewall. Several base
application service ports intentionally retain Docker's all-interface binding
for existing local/mobile workflows. Run it only on a trusted machine behind a
firewall and do not publish those ports to the Internet. The experimental
add-on below is independently checked as loopback-only; an Internet-facing
distribution must also make the baseline ingress-only and remove direct
service bindings.

## Baseline topology

| Capability | Local component | State and responsibility |
| --- | --- | --- |
| Main relational data | PostgreSQL 18 + pgvector, database `macrodb` | Persistent Docker volume; `macrodb` remains a compatibility name |
| Cache and transient state | Redis Stack | Persistent volume in the local stack, though Redis must still be treated as reconstructible cache state |
| Search | OpenSearch | Local persistent volume; index mappings are initialized by the stack orchestrator |
| Event stream | Single-node Kafka/KRaft | Local persistent volume; not an HA Kafka topology |
| S3, SQS, DynamoDB, KMS APIs | LocalStack | Emulation with dummy credentials, provisioned from the shared local resource catalog |
| Authentication | FusionAuth | Self-hosted container with generated local kickstart configuration |
| Transactional mail capture | Mailpit SMTP/UI | Safe local sink; not Internet mail delivery or a user inbox provider |
| HTTP routing | Generated Caddy proxy | Single-origin service routing on port 8090; headless stacks can also serve a built frontend |
| Public MCP | `mcp_service` behind generated Caddy | `/mcp` is forwarded without stripping; OAuth discovery, `/authorize`, `/register`, `/token`, and `/oauth/callback` share the proxy origin. The service has no direct host port |
| Frontend | Vite/SolidJS dev server | Hot-reloading app on port 3000 in the Cursor workflow |
| Application APIs and workers | Repository-built Rust/TypeScript containers | Built and orchestrated by `xtask_local`; failed optional integrations are visible in service status/logs |
| Scheduled automations | `scheduled_action_service` API + PostgreSQL polling dispatcher | Included in the complete local stack; exposed through the proxy at `/scheduled-action` and directly on port `8103` for local diagnostics |

The generated stack owns network creation, volumes, database creation and
migrations, FusionAuth kickstart, LocalStack resources, OpenSearch mappings,
Kafka topics, proxy routes, and service health reporting. Self-host recipes do
not reimplement those operations.

The clean Conation profile uses the Docker volumes `conation_postgres_data`,
`conation_redis_data`, `conation_opensearch_data`, and
`conation_kafka_data`. The tooling never adopts, renames, or deletes legacy
`macro_*` volumes automatically; an operator must inspect and migrate data
explicitly before adopting a different volume.

## AWS dependency map

The source tree still contains AWS SDK clients for S3, SQS, DynamoDB, KMS,
SESv2, SNS, Secrets Manager, Lambda, ECS, and STS. Their current self-host
status is explicit below.

| AWS dependency | Baseline decision | Production self-host status |
| --- | --- | --- |
| S3 | Emulated by LocalStack | MinIO is a plausible target but is not wired; see the endpoint limitation below |
| SQS | Emulated by LocalStack; local queue consumers run as containers | Broker-neutral durable queue adapter and production retry/DLQ operations are not defined |
| DynamoDB | Emulated by LocalStack | No non-AWS production adapter; table backup/restore is not defined |
| KMS | Emulated by LocalStack for local key-encryption flows | Requires a production key-management/HSM decision and key rotation/recovery procedure |
| SESv2 | Some transactional paths select SMTP and deliver to Mailpit | Direct SES adapters and Internet delivery are not fully replaced |
| SNS/mobile push | Not enabled in LocalStack baseline | APNS/FCM endpoint lifecycle and push delivery remain unsupported |
| Secrets Manager | Not enabled in LocalStack baseline | Must be replaced by an operator-owned secret store and adapter |
| Lambda | A subset of event handlers has local long-running worker equivalents | Remaining Lambda triggers, retries, concurrency, and schedules are unsupported |
| ECS | No production replacement | Worker-trigger task placement and lifecycle remain unsupported |
| STS | Static dummy local credentials avoid normal credential discovery | Production workload identity is not designed |
| CloudFront/ALB | Bypassed by the generated local Caddy/static-file routes | Public TLS, CDN caching, signed URL parity, WAF, and multi-node ingress remain unsupported |
| EventBridge/scheduled jobs | User-created Conation automations run in `scheduled_action_service`; its PostgreSQL dispatcher atomically claims due rows | The broader inventory of legacy AWS schedules, missed-run policy, and production multi-node operations remains incomplete |

RDS/pgvector, ElastiCache, Amazon OpenSearch, and MSK concepts already have
local PostgreSQL, Redis, OpenSearch, and Kafka substitutions. That does not by
itself provide production HA, encryption, monitoring, or disaster recovery.

### Object-storage events

The supported local orchestrator provisions the `doc-storage` bucket and wires
its `ObjectCreated` events to the document-upload-finalizer SQS queue. The
`document_upload_finalizer_local_worker` consumes that queue. Other production
S3-to-Lambda flows are not comprehensively replaced.

The application currently uses one `LOCAL_AWS_URL` for all AWS SDK clients.
Pointing it at MinIO would route SQS, DynamoDB, and KMS calls to MinIO as well.
Therefore the experimental Compose file starts MinIO only as an isolated
compatibility target and does not override application services. A real MinIO
cutover requires service-specific endpoint configuration plus presigned URL and
event-delivery tests.

### Mail

The supported baseline routes supported SMTP paths to Mailpit. Gmail inbox
linking/sync remains an external integration. The experimental Stalwart
container is healthy in bootstrap mode, but it is **not** an application mail
backend. After an operator completes bootstrap, an explicit, tested recipe can
create the `conation.dev` domain and three fixed support mailboxes without
resetting existing passwords:

```bash
nix develop --command just selfhost-provision-support-mailboxes
```

The server image does not contain a CLI; the recipe runs the separately
digest-pinned official Stalwart CLI image. JMAP reads, sync cursors, push
events, application outbound authentication, and mailbox migration are still
unwired. In particular, the Conation web inbox remains Gmail-only. See
`docs/SELF_HOST_STALWART_MAILBOX_AUDIT_RU.md` for the provider trace, secret
contract, DNS/deliverability checklist, and exact unsupported boundary. No
custom Stalwart production configuration is shipped or mounted yet.

## Experimental overlay

`docker/docker-compose.selfhost.yml` retains MinIO, Stalwart, LocalStack, and a
local Caddy facade for bounded integration work. It is a standalone add-on
definition, not a second application runner, and has no `up` recipe. Validate
it without touching running containers:

```bash
nix develop --command just selfhost-overlay-check
```

The validation uses the tracked `.env.selfhost.example`; it never needs to read
an ignored secret-bearing `.env.selfhost`. It composes the add-on file alone,
rejects inherited application services, rejects every non-loopback published
port, and requires every image reference to contain an immutable digest. The
Caddy facade is plain HTTP and forwards application traffic to the supported
proxy on port 8090. Its default endpoints are:

- `http://localhost:8088/app` with `Host: conation.localhost`
- MinIO API/UI on ports 9000/9001
- Stalwart JMAP/bootstrap UI on port 18081
- Stalwart SMTP/submission/IMAPS on ports 2525/2587/2993

Those ports are configurable and bind to `127.0.0.1` by default. The validation
fails closed if an environment file changes the bind address to `0.0.0.0` (or
any other non-loopback address).

The add-on images are pinned by both readable tag and registry digest: MinIO
server `RELEASE.2025-09-07T16-13-09Z`, MinIO client
`RELEASE.2025-08-13T08-35-41Z`, Stalwart `v0.16`, and Caddy
`2.11.4-alpine`. LocalStack's major-version tag is also digest-pinned. Updating
any pin requires a config check plus the relevant health/integration tests; a
moving `latest` tag is not accepted.

## Secrets and configuration ownership

- The local baseline generates deterministic non-production plumbing and dummy
  AWS credentials in `xtask_local`.
- `DOPPLER_TOKEN` (or `DOPPLER_PREVIEW_TOKEN`) is optional. When present, the
  Cursor script reads the `local/lcl_preview` configuration; without it, the
  stack uses local stubs. Inject the token as an environment secret, never into
  a tracked file or chat.
- `NIX_CACHE_AWS_ACCESS_KEY_ID` and `NIX_CACHE_AWS_SECRET_ACCESS_KEY` are
  optional read-only credentials for the private Nix cache. Source builds work
  without them but take longer.
- A private-package build may require `GITHUB_PACKAGES_TOKEN`; keep it in the
  process environment or operator secret store.
- A copied `.env.selfhost` owns only experimental MinIO/Stalwart credentials
  and port/domain interpolation. It is not a production application secret
  inventory.
- AI providers, OAuth providers, billing, mobile push, and external connectors
  each remain operator-selected integrations. Their credentials are not part of
  the no-managed-cloud core and should be omitted when the feature is disabled.

Before production support, every required variable must have an owner, rotation
policy, startup validation, and redacted diagnostics. The application must use
its typed environment macros; deployment work must not introduce ad-hoc
`std::env::var` reads in Rust.

## Smoke test

After `bash .cursor/stack.sh` completes:

```bash
nix develop --command just stack status --json
curl -fsS http://localhost:8090/auth/health
curl -fsS http://localhost:8090/scheduled-action/health
curl -fsS http://localhost:8090/.well-known/oauth-protected-resource/mcp
test "$(curl -sS -o /dev/null -w '%{http_code}' http://localhost:8090/mcp)" = 401
curl -fsS http://localhost:4566/_localstack/health
curl -fsSI http://localhost:3000/app
```

Then open `http://localhost:3000/app`, request a passwordless login, obtain the
code from `http://localhost:8025`, sign in, upload a small document, and confirm
it can be reopened. Inspect the upload-finalizer worker and search service in
`just stack status` if indexing does not complete.

The generated local environment sets `MCP_PUBLIC_URL` to the proxy origin
(`http://localhost:8090` for the default instance), and the FusionAuth
kickstart registers the corresponding exact callback
`http://localhost:8090/oauth/callback`. Named instances use their derived proxy
port. Only the local process additionally accepts the exact internal authority
`mcp-service:8080` used by agent egress; deployed environments do not add that
authority. Internet deployment still requires operator-owned DNS/TLS and the
production callback described in `docs/CONATION_INTEGRATIONS_RU.md`.

The experimental add-ons can be probed independently when already running:

```bash
curl -fsS http://localhost:9000/minio/health/live
curl -fsS http://localhost:18081/ >/dev/null
```

A healthy MinIO or Stalwart container is not evidence that the application is
using it.

## Upgrades, backup, and recovery

`bash .cursor/rebuild.sh` updates backend binaries without wiping volumes. The
local stack's init snapshots are acceleration artifacts, not operator backups.

`just selfhost-backup /absolute/path/outside/the/repository` creates a
PostgreSQL-only `macrodb` dump with restrictive file permissions. The recipe
rejects relative and canonically in-repository destinations, including paths
redirected into the checkout by a symlink, so a database export cannot be
captured by a source snapshot. A not-yet-created directory outside the checkout
is supported. Failed dumps remove their private temporary file; successful
dumps are atomically published under collision-safe names. It intentionally
reports that it is incomplete.
A production recovery plan still needs coordinated, versioned backups for
PostgreSQL, object storage, FusionAuth, Kafka, and OpenSearch; Redis should be
rebuildable.
Restore order, point-in-time consistency, encryption, off-host retention, and a
regular restore drill are not implemented.

Observability is also local-only. Jaeger can be enabled for traces, but there is
no supported production metrics/logging/alerting/SLO bundle.

## Production acceptance gates

Do not advertise an Internet-facing deployment as supported until all of these
are complete:

1. Split AWS endpoints by capability and validate MinIO plus object events.
2. Implement and test a Stalwart/JMAP provider end to end, or explicitly omit
   inbox hosting and use a tested SMTP relay for transactional mail.
3. Replace or formally exclude SNS, Secrets Manager, Lambda, ECS, legacy
   schedules outside `scheduled_action_service`, and every remaining direct AWS
   client path.
4. Define TLS, DNS, OAuth callback, CORS, signed-link, and public ingress
   compatibility contracts.
5. Pin the remaining base-stack images/artifacts and publish migrations,
   rolling/rollback procedures, resource sizing, health/readiness checks, and
   an upgrade support window.
6. Complete backup/restore, key recovery, monitoring, and security hardening;
   test them on a clean host.
7. Run functional smoke and failure/recovery tests without any managed AWS
   credentials in the environment.

The repository is AGPLv3-licensed. Operators who modify it and provide network
access must account for the license's corresponding-source obligations.
