# Self-hosting entry points.
#
# The supported no-managed-cloud baseline delegates to the repository-owned
# Cursor/xtask stack. The MinIO/Stalwart/Caddy Compose overlay is experimental
# and deliberately has no `up` recipe until those adapters are wired end to end.

# Start only the local infrastructure needed by DB-backed development/tests.
selfhost-infra:
    bash .cursor/infra.sh

# Start the supported local product stack (backend + hot-reloading frontend).
selfhost-up:
    bash .cursor/stack.sh

# Rebuild and remount backend binaries without resetting stack data.
selfhost-rebuild:
    bash .cursor/rebuild.sh

# Report service/container health through the repository stack orchestrator.
selfhost-status *ARGS:
    just stack status "$@"

# Stop the supported stack while retaining its persistent volumes.
selfhost-down:
    just stack down --keep-data

# Follow one service's logs without reconstructing the generated Compose command.
selfhost-logs SERVICE:
    #!/usr/bin/env bash
    set -euo pipefail
    service={{ quote(SERVICE) }}
    project="${SELFHOST_STACK_PROJECT:-macro}"
    mapfile -t container_ids < <(
      docker ps -q \
        --filter "label=com.docker.compose.project=$project" \
        --filter "label=com.docker.compose.service=$service"
    )
    if [ "${#container_ids[@]}" -ne 1 ]; then
      echo "Expected one running $service container in project $project; found ${#container_ids[@]}" >&2
      echo "Run 'just selfhost-status' to inspect the stack." >&2
      exit 1
    fi
    docker logs --follow "${container_ids[0]}"

# Create/migrate the canonical `macrodb` compatibility database. This is
# idempotent, but the full `selfhost-up` flow already performs stack init.
selfhost-prepare-db:
    bash .cursor/infra.sh
    just initialize_dbs

# PostgreSQL-only backup. This is not a complete disaster-recovery snapshot;
# object storage, identity, Kafka, and search state are documented separately.
selfhost-backup OUTPUT_DIR:
    #!/usr/bin/env bash
    set -euo pipefail
    output_dir={{ quote(OUTPUT_DIR) }}
    root="$(pwd -P)"
    if [[ "$output_dir" != /* ]]; then
      echo "OUTPUT_DIR must be an absolute path outside the repository." >&2
      exit 1
    fi
    # `--canonicalize-missing` resolves every existing symlink while permitting
    # a new leaf: it canonicalizes the nearest existing ancestor, then safely
    # normalizes the remaining components. Validate and subsequently use that
    # resolved path so an external-looking symlink cannot redirect the dump
    # back into the checkout.
    if ! resolved_output_dir="$(realpath --canonicalize-missing -- "$output_dir")"; then
      echo "Could not resolve OUTPUT_DIR: $output_dir" >&2
      exit 1
    fi
    case "$resolved_output_dir" in
      "$root"|"$root"/*)
        echo "Refusing to write a database dump inside the repository: $resolved_output_dir" >&2
        exit 1
        ;;
    esac
    output_dir="$resolved_output_dir"
    project="${SELFHOST_STACK_PROJECT:-macro}"
    mapfile -t container_ids < <(
      docker ps -q \
        --filter "label=com.docker.compose.project=$project" \
        --filter "label=com.docker.compose.service=postgres"
    )
    if [ "${#container_ids[@]}" -ne 1 ]; then
      echo "Expected one running postgres container in project $project; found ${#container_ids[@]}" >&2
      exit 1
    fi
    umask 077
    mkdir -p "$output_dir"
    timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
    temp_file=""
    cleanup_temp() {
      if [ -n "$temp_file" ]; then
        rm -f -- "$temp_file"
      fi
    }
    trap cleanup_temp EXIT HUP INT TERM
    temp_file="$(mktemp --tmpdir="$output_dir" ".macrodb-${timestamp}.XXXXXXXXXX.tmp")"
    temp_name="${temp_file##*/}"
    unique_suffix="${temp_name%.tmp}"
    unique_suffix="${unique_suffix##*.}"
    backup_file="${output_dir%/}/macrodb-${timestamp}-${unique_suffix}.sql"
    docker exec "${container_ids[0]}" pg_dump -U user -d macrodb > "$temp_file"
    # Same-directory rename is atomic. `--no-clobber` prevents even an
    # improbable reused suffix from overwriting an earlier completed dump.
    mv --no-clobber --no-copy --no-target-directory -- "$temp_file" "$backup_file"
    if [ -e "$temp_file" ]; then
      echo "Could not publish dump without overwriting an existing file: $backup_file" >&2
      exit 1
    fi
    temp_file=""
    trap - EXIT HUP INT TERM
    echo "MacroDB dump written to $backup_file"
    echo "This does not include object storage, FusionAuth, Kafka, or OpenSearch state."

# Validate only the experimental add-on Compose file without starting or
# recreating containers. The check fails closed if a port is not loopback-bound,
# an inherited application service appears, or an image is not digest-pinned.
# Use the tracked example by default; never require an operator's ignored file.
selfhost-overlay-check ENV_FILE=".env.selfhost.example":
    #!/usr/bin/env bash
    set -euo pipefail
    root="$(pwd -P)"
    env_file={{ quote(ENV_FILE) }}
    if [[ "$env_file" != /* ]]; then
      env_file="$root/$env_file"
    fi
    if [ ! -f "$env_file" ]; then
      echo "Missing environment file: $env_file" >&2
      exit 1
    fi
    if ! docker compose \
      --project-directory "$root" \
      -f "$root/docker/docker-compose.selfhost.yml" \
      --env-file "$env_file" \
      config --format json \
      | jq -e '
          (.services | keys | sort)
            == ["caddy", "localstack", "minio", "minio-setup", "stalwart"]
          and ([.services[] | .ports[]?] as $ports
            | ($ports | length) > 0
            and all($ports[]; .host_ip == "127.0.0.1"))
          and ([.services[] | .image] as $images
            | all($images[]; test("@sha256:[0-9a-f]{64}$")))
        ' >/dev/null
    then
      echo "Experimental overlay must contain only pinned add-ons with loopback-bound ports." >&2
      exit 1
    fi
    echo "Experimental add-on Compose is pinned and loopback-only."

# Explicitly reconcile the three support mailboxes after the operator has
# completed Stalwart's v0.16 bootstrap. This never runs during stack startup.
selfhost-provision-support-mailboxes:
    #!/usr/bin/env bash
    set -euo pipefail
    export STALWART_URL="${STALWART_URL:-http://host.docker.internal:${STALWART_HTTP_PORT:-18081}}"
    bash tooling/scripts/provision-conation-stalwart-mailboxes.sh

# Pure fake-CLI harness: no container or external mail server is contacted.
selfhost-test-support-mailboxes:
    bash tooling/scripts/tests/provision-conation-stalwart-mailboxes.test.sh

selfhost-check ENV_FILE=".env.selfhost.example":
    bash -n .cursor/cloud-lib.sh .cursor/infra.sh .cursor/stack.sh .cursor/rebuild.sh
    bash tooling/scripts/tests/provision-conation-stalwart-mailboxes.test.sh
    just selfhost-overlay-check {{ quote(ENV_FILE) }}

# Public DNS, TLS, and Internet mail require an operator security design and
# are not enabled by the local experimental overlay.
selfhost-setup-dns:
    @echo "Public DNS/TLS/mail deployment is not yet a supported target."
    @echo "See infra/selfhost/README.md for the explicit gaps and prerequisites."
