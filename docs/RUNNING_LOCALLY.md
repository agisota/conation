# Running locally

This guide covers two ways to run Macro on your machine.

If you only change the frontend, run the frontend against hosted services. You do not need Docker or the local stack.

If you change a backend service, the database, or behavior that must stay on your machine, run the local stack.

## Choose a path

- **Frontend against hosted services.** Vite on your machine. APIs on hosted `*-dev` services. See [Run the frontend against hosted services](#run-the-frontend-against-hosted-services).
- **Local stack.** Docker, local infrastructure, and local Rust services. See [Run the local stack](#run-the-local-stack).

## Shared prerequisites

Install Nix before you start:

1. [Nix](https://nix.dev/install-nix) package manager

Clone the repository:

```bash
git clone https://github.com/macro-inc/macro.git
cd macro
```

The Nix shell provides `just`, Cargo, the Rust toolchain, Bun, `wasm-pack`, sqlx, zig, and cargo-zigbuild. You do not need to install these tools separately.

```bash
nix develop
```

If `nix develop` fails, enable the experimental features:

```bash
nix develop --extra-experimental-features nix-command --extra-experimental-features flakes
```

Nix requires these experimental features to work. The command above enables them for one run. To enable them permanently, set this in `~/.config/nix/nix.conf`:

```
experimental-features = nix-command flakes
```

The default shell does not include the Tauri platform dependencies. They are large, so they live in their own shells. For Linux desktop development, use `nix develop .#tauri-linux`. For Android development on x86_64 Linux, use `nix develop .#tauri-android`.

For automated Linux desktop offline tests, use `nix develop .#tauri-e2e` and the
[native E2E guide](../apps/web/tests/native/README.md). It runs the real Tauri
webview/native cache with deterministic API fixtures, without the local stack.

## Run the frontend against hosted services

The web app talks to hosted `*-dev` services when you run `bun run dev` from the web app.

Limits:

- You still need Nix. The first `bun run dev` may compile wasm. Later runs skip that compile when versions match.
- The UI calls hosted `*-dev` services and shared data.
- Sign-in is not the local Mailpit flow. If you need a private database or to change a backend service, use the [local stack](#run-the-local-stack).

From the repository root, inside the Nix shell:

```bash
bun install
cd apps/web
bun run dev
```

The first run, or a run after a wasm version change, may build wasm packages. Vite prints a local URL when it is ready.

## Run the local stack

The local stack runs without Doppler. It runs Postgres, Redis, LocalStack, OpenSearch, Kafka, and FusionAuth in Docker, with dummy AWS credentials and fixed test secrets.

On Linux, the Nix dev shell supplies the Docker CLI, daemon, Compose, and `fuse-overlayfs`. Nix is the only host dependency.

On macOS, install a Docker runtime such as Docker Desktop, OrbStack, or Colima. The Nix dev shell supplies the Docker CLI, but macOS still needs the runtime to provide the daemon.

Run the preflight check before the first start:

```bash
just doctor-local
```

The check tests the Docker daemon, the toolchain, and the required ports. It reports any problem and suggests a fix. If a start fails, run the check again.

Run this command from the repository root if you do not have Doppler access:

```bash
just run_local --no-doppler
```

The local stack does not need Doppler. It uses the code-defined local configuration with dummy AWS credentials and fixed test secrets. Most contributors are not on the team, so this is the common path.

The stack boots with stubbed values for every config the services require, including the third-party integrations (Google, GitHub, Stripe, CloudFront). Those flows do not work against real services with the stubs. The rest of the stack is fully functional: auth, documents, email, and search.

To use a real integration locally, supply its keys via `--env-file` — see [Integration Secrets](#integration-secrets) below.

Run this command if you have Doppler access. It pulls the `lcl_personal` config. Then it overlays the code-defined local defaults. Every integration value is real:

```bash
just run_local
```

If you prefer to test against real cloud infrastructure, you need [Doppler](https://www.doppler.com) for secrets management.

This command:

- Builds the Rust backend services
- Starts the local infrastructure (Postgres, Redis, LocalStack, OpenSearch, Kafka, FusionAuth)
- Starts the backend services
- Starts the local proxy and the frontend

When startup finishes, the command prints the frontend URL and the important service URLs.

Open the frontend URL in your browser.

The local environment supplies both `LOCAL_AWS_URL` (the container endpoint)
and `LOCAL_AWS_PUBLIC_URL` (the instance's published LocalStack port). SFS and
other presigned uploads use the public endpoint in browser-facing URLs. If an
upload attempts `localhost:4566` on a named instance, rebuild the service and
reload its generated environment; named instances publish storage on their own
port.

The stack does not create accounts in advance. Passwordless login creates a user
on demand. Register with any email address. FusionAuth sends you a one-time code
by email. That email lands in **Mailpit** at http://localhost:8025, not in a real
inbox.

### Seeding sample data (recommended)

A bare stack has no content to click through. The seed CLI creates a realistic
world: users, teams, channels, projects, documents, tasks, chats, calls, emails,
and messages. The world uses realistic permissions.

From the repository root, after the stack is up:

```bash
just seed-scenario apply --file seed/scenarios/team-perms.json
```

`apply` creates a FusionAuth account for each persona. It prints a login link per
persona, for example `http://alice.localhost:3000/app/login?email=alice@seed.macro.local`.
Open each link in a plain browser tab. Each persona hostname has its own cookie
jar. You can drive several personas side by side against one stack.

Useful commands:

- `just seed-scenario status --file seed/scenarios/team-perms.json` — show what is seeded and re-print the login links.
- `just seed-scenario reset --file seed/scenarios/team-perms.json` — remove the scenario's rows and its user accounts by email.
- `just seed-scenario matrix --file seed/scenarios/team-perms.json` — check the expected access level for every user and entity pair against the live database.

`apply` touches only rows that carry the scenario `5eed` id marker, plus the
persona accounts it created. It is safe to run against a stack that you tested in.

## Integration Secrets

A `--no-doppler` stack boots with deterministic stubs for every value the services' config loaders require. The stubs are enough to start the services. The third-party integrations they back do not work until you supply real values:

| Integration | Keys | Stub behavior |
| --- | --- | --- |
| Google login / Gmail | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET_KEY` | Google SSO and Gmail inbox linking are unavailable. Local signup still works. The email service reports no Gmail grant and skips inbox syncing. |
| GitHub login | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_IDP_ID` | Login with GitHub is unavailable |
| Stripe billing | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` | Checkout and subscription endpoints fail. Signup still works: the create-user webhook detects the stub key and skips the real Stripe call. It stores a placeholder customer id instead. |
| CloudFront signed URLs | `DOCUMENT_STORAGE_SERVICE_CLOUDFRONT_DISTRIBUTION_URL`, `DOCUMENT_STORAGE_SERVICE_CLOUDFRONT_SIGNER_PUBLIC_KEY_ID`, `DOCUMENT_STORAGE_SERVICE_CLOUDFRONT_SIGNER_PRIVATE_KEY` | Document download URLs are unsigned (fine against local S3) |

The other stubbed keys (`REDIS_HOST`, `MACRO_DB_URL`, `INTERNAL_API_KEY`, `AUTHENTICATION_SERVICE_SECRET_KEY`, `OPENSEARCH_USERNAME`, `OPENSEARCH_PASSWORD`) are internal plumbing with correct local values — you never need to override them.

To turn on an integration, create a `local.env` with the real values. Then pass it
to `run_local`:

```bash
just run_local --no-doppler --env-file ./local.env
```

Keys in the file override the code-defined defaults, so you only need to list the integrations you care about. With Doppler access, `just run_local` (without `--no-doppler`) supplies everything automatically.

## Tracing, Logs, and the Debug Browser

`just run_local` and `just stack up` support two global (per-machine, shared
across instances) debugging containers:

- **LGTM collector** (`--traces lgtm`, the default): Grafana at
  http://localhost:3001 with Tempo (traces), Loki (service logs), and
  Prometheus behind it. Rust services export spans and `tracing` events over
  OTLP; the frontend exports browser spans through the proxy and propagates
  `traceparent`, so one trace covers browser → proxy → services. Swap with
  `--traces jaeger|datadog`, or disable with `--traces off`.
- **Agent browser** (opt-in via `--with-chrome`): Chromium with the DevTools
  protocol on http://localhost:9222, for agents driving the app (the
  `chrome-devtools` MCP server in `.mcp.json` / `opencode.json` /
  `.cursor/mcp.json` points at it). Watch what an agent is doing live at
  http://localhost:6080/vnc.html.

See `.claude/skills/live-debug/SKILL.md` for query recipes (Tempo/Loki HTTP
APIs) and the browser-debugging workflow.

For agent turns, use Tempo's TraceQL query
`{span.gen_ai.operation.name="invoke_agent"}`. The session actor records the
ACP prompt, output and tool activity on that trace and sends its context in
`params._meta["macro.dev/trace-context"]`. Macro's in-process runtime restores
that context so its model calls and backend work appear in the same trace.
Other runtimes must explicitly consume this metadata to correlate their
internal spans; their ACP activity is still traced by the session actor.

GenAI content is bounded by `genai_telemetry`; check
`macro.genai.content_truncated` before using a span for evaluations.

## Control the Running Stack

While `run_local` is attached:

- Press `r` to rebuild the changed Rust services and reload them.
- Press `f` to restart Vite with the same frontend port and configuration. This
  also recovers a stuck frontend reload and leaves backend services and data intact.
- Press `q` to stop the stack and exit.

Use `q`, not the terminal close button. `q` stops and removes the containers at once. The next start does not have to clean up a stale stack.

## Run More than One Stack

Use named instances for several local stacks at once. This helps across worktrees:

```bash
just run_local --instance agent-a
just run_local --instance agent-b
```

Each instance has its own resources:

- a Compose project
- volumes and networks
- env files
- a proxy port, a frontend port, and backend ports

The ports are deterministic for the instance name. The same name gets the same
port window on every run.

If the port window conflicts with another program, change the base port:

```bash
just run_local --instance agent-a --port-base 23000
```

The generated files for an instance live here:

```text
infra/local/generated/<instance>
```

### Access a remote dev server through one URL

`run_local` and `run_dev` serve API requests and backend WebSockets through Vite,
so the browser needs only the frontend port. For example, forward a remote
instance's frontend with `ssh -N -L 3000:127.0.0.1:20110 your-dev-host`, then open
`http://localhost:3000/app/`. A WebSocket-capable reverse proxy can instead expose
that frontend under a different hostname/port, including HTTPS. Vite HMR follows
the page's origin; no separate HMR or backend port forward is needed.

The launcher sets `VITE_LOCAL_BACKEND_ORIGIN=same-origin` and supplies Vite's
server-only `MACRO_LOCAL_BACKEND_PROXY` and `MACRO_LOCAL_BACKEND_ROUTES` from the
selected instance and backend inventory. The proxy preserves paths, query
strings, cookies, streaming responses and WebSocket upgrades. AI-editing and
enabled browser telemetry also use same-origin paths. Bare `bun run dev` without
these variables still uses hosted services; `TAURI_DEV_HOST` remains an explicit
native HMR override. Keep local dev stacks private: same-origin routing does not
add authentication or make passwordless local login safe to publish.

### Production-mode self-host web bundle

For an explicitly self-hosted production web bundle served behind the same
reverse proxy, run `cd apps/web && just build-selfhost-prod`. It sets
`MODE=production`, `VITE_LOCAL_BACKEND_ORIGIN=same-origin`, and
`VITE_LOCAL_SERVERS=ALL`. The app routes its declared backend service hosts and
sync worker/WebSocket to the page's origin; hosted production builds continue
to use the existing remote defaults (`just build-prod`). A partial or invalid
self-host configuration throws rather than falling back to hosted service
hosts. Google Analytics, Google Tag Manager, Meta Pixel, and PostHog
initialization/event capture are disabled in this mode.

Set `SELF_HOSTED_APP_ORIGIN` on the authentication service to the exact public
HTTPS origin serving `/app` (for example, `https://workspace.company.test`,
without `/app`, credentials, query, or fragment). When `APP_SECRETS_JSON` is
present, put `SELF_HOSTED_APP_ORIGIN` in that JSON object: the config reader
intentionally does not use a separate process-env value for a missing JSON key.
Otherwise supply it through the service's normal env source. An unreadable or
malformed value prevents startup.

With this setting, SSO accepts redirects only back to that configured origin,
the default login/email-verification redirect is its `/app` route, and auth
cookies are host-only rather than scoped to `macro.com`. Without the setting,
the existing hosted redirect and cookie policy remains in force, so the
self-hosted bundle alone cannot complete login safely. Verify the proxy's
`/auth` callbacks, FusionAuth redirect registrations and actual browser cookie
handoff for the final public origin before opening the installation to users.

Private OAuth login and account linking also need the proxy to pass the
short-lived, host-only `__Host-ctn_oauth_nonce_*` cookies from the initiation
response through the identity provider's top-level GET callback. Browser
requests that initiate account linking must include credentials even in
bearer-token mode. This flow does not support iframe or `form_post` callbacks;
verify cookie delivery and single-use replay rejection on the deployed origin.

The nonce binds the browser callback to one issued flow and rejects replay;
it does not prove that an authorization code came from that flow if a user
discloses their still-live authorization URL (including its state) and is
induced to visit a forged callback. Never forward a live provider authorization
URL. If it is exposed, abandon that attempt and begin a new login or link
flow after the ten-minute nonce expires; do not treat a callback from the
exposed flow as verified. This threat and actual provider callback behavior
remain part of deployment acceptance, not a claim established by source tests.

Prefer same-origin `/auth` routing. If the browser calls authentication on a
different origin, configure the auth service's `ALLOWED_ORIGINS` for the exact
private app origin and credentialed CORS; the API and callback cookie must
remain on the same HTTPS auth host. Do not treat a successful initiation URL
without a delivered cookie as a working login.

Macro's hosted origins and `macro://` native handoffs are not allowlisted
when a private app origin is configured; native corporate handoff needs its
own trusted callback scheme and separate verification.

This is a browser-routing and analytics-init boundary, not a general egress
firewall or full self-host acceptance. The proxy inventory does not include a
PDF service route; the bundle points PDF requests at same-origin `/pdf`, which
will not provide PDF functionality unless the deployment adds that route.
The browser calls `/auth/logout` to clear the app and FusionAuth session, then
returns to same-origin `/app/login`; it must not navigate to an unregistered
`/auth/oauth2/logout` route. Login/SSO starts through same-origin `/auth`, but a
configured external identity provider can still receive a top-level browser
redirect. Email rendering can load remote message images through the
same-origin `/image-proxy` route; this does not prove the proxy's upstream
fetches are constrained. The BYOA roster links to `docs.macro.com` on click.
Invite links generated in the self-hosted browser use that browser's origin
instead of `macro.com`. The UI does not offer Macro's hosted MCP connector
configuration in this mode: this stack has no public MCP HTTP proxy route,
so a local MCP integration must be deployed and verified separately.
Other browser assets, email/calendar/call/agent runtime dependencies, and
backend egress require separate route inventory and live egress verification.
This build flag alone does not establish that those flows are self-hosted.

The stack launches Vite directly with Node (available in the Nix shell), because
Bun's Node HTTP compatibility currently hangs on Vite's proxied WebSocket
upgrades. Bun is still used for dependency installation and builds.

## Port Conflicts (macOS)

The default instance binds a fixed set of host ports. macOS reserves some of them
for its own services. If the app loads but API calls return unexpected HTML, a
port is probably hijacked by an unrelated process. The two most common conflicts
on a fresh Mac:

- **Port 8080** — macOS WebDriver service (`com.apple.WebDriver.HTTPService`). It listens on this port when remote automation is on. The auth service cannot bind it.
- **Port 8090** — another project's dev server, for example an Expo server with `--port 8090`. The proxy cannot bind it.

The frontend loads, but login and API calls hit the other process. You see HTML
or console errors instead of JSON. `just doctor-local` reports the busy ports
before you start.

Run the stack on a port window that is free on your machine. You do not need to
kill the other process:

```bash
just doctor-local                         # see which default ports are busy
just doctor-local --instance test --port-base 31000   # check the new window is free
just run_local --no-doppler --instance test --port-base 31000
```

A named instance binds every service at `port-base + offset`. A free base like
`31000` moves the whole stack to one contiguous window. Use any base that is free
on your machine. See `just doctor-local` for the busy ports. Keep the same
`--instance` name and `--port-base` on later runs so the ports stay deterministic.

Use the same two flags for every command. Run the stack, seed it, and check it
with the same `--instance` and `--port-base` values:

```bash
just run_local --no-doppler --instance test --port-base 31000
just seed-scenario --instance test --port-base 31000 apply --file seed/scenarios/team-perms.json
just seed-scenario --instance test --port-base 31000 status --file seed/scenarios/team-perms.json
just status_local --instance test --port-base 31000
```

If you omit `--port-base`, a named instance gets a deterministic port window
derived from its name. That window is different from the one you chose. A stack
started with an explicit `--port-base` must be seeded with the same explicit
`--port-base`, or the seed CLI looks at the wrong database. The default instance
(no `--instance`) always uses the fixed ports and needs no extra flags.

The seeded persona login links embed the frontend port. If you switch ports, run
`just seed-scenario apply` again to get links that match the new window.
`just status_local`, with the same two flags, prints the live endpoints.

## What the Stack Rebuilds

The Rust services are built on the host with `cargo zigbuild`. The binaries are mounted into a shared runtime image. Docker does not compile these services during a normal `run_local`.

Press `r` to rebuild the binaries. Only the services whose binaries changed restart.

Three services have Docker-built images. They are not rebuilt by default:

- `sync_service`
- `lexical_service`
- `websocket_service`

If you change these services, the running stack can use a stale image. Force a rebuild with this flag:

```bash
just run_local --build-aux-services
```

When you start the stack with `--build-aux-services`, press `r` to rebuild those images and recreate their containers. This is slower, so leave the flag off unless you work on those services.

If you started without the flag and suspect a stale image, press `q`. Then start again with the flag.

## Headless Mode

`just stack` runs the same stack without an attached terminal. There is no hotkey loop and no dev server. The frontend is built once and served statically by the proxy. The whole product lives behind one origin. A finished `up` leaves only Docker containers running.

```bash
just stack up                  # bring everything up, print URLs, return
just stack status --json      # machine-readable state (containers, health, URLs)
just stack update             # rebuild and reload only the changed services (the `r` hotkey)
just stack update --frontend  # also rebuild the frontend bundle
just stack update --binaries-dir <dir>  # remount a prebuilt set; volumes stay
just stack down               # remove containers, volumes, and state
```

All the `run_local` flags apply to `stack` too. This includes `--instance`, `--no-doppler`, `--no-build`, and `--binaries-dir`.

The app is served at `<proxy>/app/`. The bundle resolves its backend from the origin it is served on. The same stack works on localhost or behind any hostname without a rebuild.

### Internal auth key changes

For a local stack, FusionAuth's user webhooks and the authentication service must use the same internal key. The generated kickstart takes `INTERNAL_API_SECRET_KEY` from `APP_SECRETS_JSON` when that JSON is present; otherwise it uses the resolved flat environment. `INTERNAL_API_KEY`, `INTERNAL_AUTH_KEY`, and `AUTHENTICATION_SERVICE_SECRET_KEY` must be present and equal in that same source. A missing, inconsistent, or HTTP-header-invalid value stops preparation before the existing stack is torn down.

Supply `APP_SECRETS_JSON` through Doppler or `--env-file` when using it to override the local defaults. The xtask process-environment overlay changes only keys already present in the resolved map; setting a new `APP_SECRETS_JSON` variable in the shell alone does not add it. Keep the file containing real secrets outside version control.

`stack update` preserves volumes but cannot rotate the key inside an already initialized FusionAuth database. It refuses a changed key or an older stack state without an initialization fingerprint. Do not use `stack up` as a data-preserving rotation command: it tears down the current local volumes and recreates the stack. Back up application data separately before any deliberate reinitialization; the init snapshot below is **not** an application-data backup. This guard does not rotate external provider credentials or update a populated FusionAuth database in place.

### Init Snapshots

`just run_local` and `stack up` both cache the expensive infrastructure initialization. The first cold run:

- Migrates the database
- Creates the Kafka topics
- Waits for the FusionAuth kickstart
- Creates the search indices

It saves these volumes as an init snapshot. The snapshot is content-addressed and stored under `infra/local/generated/.snapshots`. Later runs restore the snapshot and skip the initialization. An input change causes a cache miss and a normal full init — the key *is* the definition of clean state, so the full-delete/full-create guarantee is unchanged.

Useful commands:

```bash
just run_local --no-snapshot  # skip the snapshot cache
just stack up --no-snapshot   # same flag, headless
```

Cursor Cloud bakes the snapshot during environment install. Later `stack up` restores it.

### Portable Data Backups

Init snapshots only accelerate a clean stack initialization; they are not
application-data backups. Portable backups support a headless local instance
started with `just stack up`, not an attached `just run_local` process. The
source stack and checkout must use the same clean Git commit, and the stack
must have been built from that checkout (not `--no-build` or `--binaries-dir`).
Use this command to capture the live state of a fully running local instance:

```bash
just stack backup-data --output /secure/macro-backup --instance agent-a --port-base 31000
```

The destination directory must be new. The command briefly stops application
writers, pauses LocalStack, stops the stateful services, archives the seven
instance volumes, then restarts the stack. It records checksums for every
archive and prints a SHA-256 digest for `manifest.json`; transmit that digest
separately through an operator-trusted channel. Backup fails closed if any
expected Docker volume is missing or is not mounted at the expected stateful
service path. It also verifies that this checkout owns the active Compose
project and that the authentication service's mounted binary directory matches
its recorded workspace build. The bundle includes Postgres, Redis, OpenSearch,
Kafka, FusionAuth's database and config, and LocalStack's S3, KMS, SQS, and
DynamoDB state. LocalStack persistence uses `ON_REQUEST`, which saves each
mutating AWS API operation to its volume and can add write latency.

If the process is killed while writers are stopped, the next stack-data
operation reclaims any labeled archive helper and resumes the recorded source
containers before continuing. If cleanup or recovery cannot be confirmed, the
operation fails closed instead of reusing a mounted volume.

Portable data operations are pinned to one effective UID on this host for the
Docker Engine/project pair. Use the same UID for every checkout that shares an
instance. Cross-UID operation and handoff are unsupported: a safe transfer
requires a trusted monotonic owner/lock anchor that an unprivileged prior UID
cannot remove, which local `/var/tmp` does not provide. The
`handoff-data-operator` command therefore fails closed. Unversioned or legacy
cross-UID binding metadata or any prior handoff record also causes a fail-closed
refusal; do not remove those records to resume operation. Cross-host
coordination is unsupported. Independent Docker-capable processes do not honor
this lock; do not mutate the instance's containers or volumes outside these
commands while an operation is in progress. Do not manually remove or replace
the binding or lock files.

Do not enable this implementation on a Docker daemon/project that previously
used a cross-UID handoff, even if its legacy binding files appear absent: a
former UID may have removed every file it owned, and an unprivileged process
cannot distinguish that state from first use. Such installations need a
trusted, privileged ownership migration outside this command. The private
source import applies only to a fresh binding with no handoff history; it is
not a populated backup/restore acceptance claim.

Restore only into an empty target whose Docker containers, volumes, stack state,
and allocated ports are absent:

```bash
just stack up --restore-from /secure/macro-backup \
  --trusted-manifest-sha256 <digest-from-trusted-channel> \
  --no-doppler --instance restored --port-base 31000
```

Use the exact source Git commit on a clean checkout. Restore checks the
application version, database migration set, Docker platform, stateful image
IDs, FusionAuth internal auth-key fingerprint, MCP credentials-encryption-key
fingerprint, and complete host-port map before creating target data. Select the
same `--port-base`; the source stack must be stopped before restoring to the
same port window on the same machine. Restore requires the normal workspace
build; `--no-build` and `--binaries-dir` are rejected because those binaries
cannot be verified against the backup's source revision. The target must use
the same FusionAuth internal auth key and MCP credentials-encryption key.
Supply external provider credentials separately; they are not captured,
restored, or rotated by this command.

The manifest's archive checksums detect corruption but do not establish
provenance. Restore therefore requires the manifest digest obtained separately
through a trusted channel. It stages private copies of the verified manifest
and archives before using them. Restore never tears down an existing stack and
creates target volumes only when their names are still absent. Each restore
helper first rejects volumes mounted by another container, then atomically
claims its target volume, checks emptiness, and extracts in the same container.
This excludes cooperating restore helpers, but cannot guarantee no-clobber
behavior against an unsynchronized Docker-capable actor that writes to the
volume concurrently.
If extraction or startup fails, the
incomplete target volumes are intentionally left in place; inspect the target,
then remove only that target with
`just stack down --instance restored --port-base 31000` before retrying. Full
teardown stops if helper cleanup or volume removal cannot be confirmed, and
does not recreate or reuse the old volumes.

### Migrating a running stack

`just stack update` does not run database migrations. To upgrade a persistent
stack across schema revisions, first make a portable backup while the current
checkout still matches the running revision and retain its printed manifest
digest through a trusted channel. Then prepare a complete binary directory for
the target checkout in a location separate from the directory currently
mounted by the running stack. From the clean target checkout, run:

The update reads the existing stack record from the checkout that owns the
running Compose containers, so the clean target checkout may be a separate
worktree. After remounting services, the target checkout owns the new generated
Compose configuration and stack record.

The source checkout's stale stack record is invalidated after the target state
is committed. If migration is interrupted, the durable recovery record defers
that invalidation until destructive teardown, before restoring the source
backup.

```bash
just stack update --migrate \
  --pre-migration-backup /secure/macro-backup \
  --trusted-manifest-sha256 <digest-from-trusted-channel> \
  --binaries-dir /secure/target-binaries \
  --instance agent-a --port-base 31000
```

The command verifies that the authenticated backup belongs to the recorded
running revision, checks that the target binaries use a separate directory,
stops application writers, runs the existing non-destructive `sqlx migrate
run`, and only then recreates Rust services from the supplied binaries. Do not
use `stack up` for an in-place upgrade: it tears down and removes volumes.

If migration fails or the process is killed after writers stop, application
writers remain stopped. An interruption record makes later stack updates fail
closed rather than restarting code against a possibly changed schema. The
command does not attempt an unsafe automatic schema rollback. To recover,
destroy the failed target with `just stack down` using the same instance and
port arguments; then check out the exact source revision recorded in the backup
manifest and restore that backup with `stack up --restore-from` and its trusted
manifest digest. After a successful migration, a normal workspace-built
`stack update` builds and remounts workspace binaries if an external binary
directory is still mounted; only that verified workspace update permits a
later portable backup.

Bundles contain plaintext databases, identity state, S3 objects, and KMS key
material. The command creates the bundle directory with mode `0700` and files
with mode `0600` on Unix, but it does not encrypt them. Keep bundles out of Git,
restrict transfer/storage, and encrypt them using your approved backup-storage
process.

## Common Commands

Run local binaries against shared dev resources instead of a full local stack:

```bash
just run_dev
```

`run_dev` uses shared dev resources. It needs Doppler and real cloud access. It is for contributors with team access.

See what a running or stopped instance looks like. The output shows endpoints with live reachability probes, plus the state and host ports of every container. It does not start or rebuild anything:

```bash
just status_local
```

Stop an instance but keep its volumes:

```bash
just stop_local --instance agent-a
```

Remove the containers, volumes, and named-instance networks of an instance:

```bash
just destroy_local --instance agent-a
```

Drop, recreate, and migrate an instance database:

```bash
just reset_local --instance agent-a
```

### Finding out where a bring-up spent its time

Every run prints its slowest stages before the summary. To compare runs, point
`MACRO_LOCAL_TIMINGS` at a file — each run appends one JSON line of every stage
and its duration:

```bash
MACRO_LOCAL_TIMINGS=/tmp/run-local-timings.jsonl just run_local
```

For the default instance, omit `--instance`.
