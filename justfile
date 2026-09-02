set positional-arguments

# Freeze Docker Compose resources across checkouts/worktrees. Local setup is
# single-instance by design; do not derive resource names from the directory.
# A clean local installation is the Conation profile. Legacy Macro resources
# are deliberately neither adopted nor removed by these recipes.
export COMPOSE_PROJECT_NAME := "conation"

compose := "docker compose --project-directory . -f docker/docker-compose.yml"
# Load database services through the base Compose include so relative build
# contexts have one canonical resolution root.
database_compose := "docker compose --project-directory . -f docker/docker-compose.yml"
selfhost_compose := "docker compose --project-directory . -f docker/docker-compose.yml -f docker/docker-compose.selfhost.yml"

# Creates global networks that are shared across docker-compose files
create_networks:
  docker network create databases 2>/dev/null || true -- db network
  docker network create auth 2>/dev/null || true -- fusionauth network
  docker volume create conation_postgres_data 2>/dev/null || true
  docker volume create conation_redis_data 2>/dev/null || true
  docker volume create conation_opensearch_data 2>/dev/null || true
  docker volume create conation_kafka_data 2>/dev/null || true
  docker volume create conation_fusionauth_db_data 2>/dev/null || true
  docker volume create conation_fusionauth_config 2>/dev/null || true
  docker volume create conation_minio_data 2>/dev/null || true
  docker volume create conation_stalwart_data 2>/dev/null || true
  docker volume create conation_caddy_data 2>/dev/null || true
  echo "docker networks and volumes created"

get_environment CONFIG="lcl":
  #!/usr/bin/env bash
  set -euo pipefail
  DOPPLER_CONFIG={{ quote(CONFIG + "_personal") }}
  # Use JSON + jq so multiline secrets become single dotenv entries with escaped newlines.
  doppler secrets download --project local --config "$DOPPLER_CONFIG" --format json --no-file \
    | jq -r '
      def trim_surrounding_newlines:
        sub("^[\r\n]+"; "") | sub("[\r\n]+$"; "");
      to_entries
        | sort_by(.key)[]
        | "\(.key)=\(.value | tostring | trim_surrounding_newlines | @json)"
    ' > .env

# Creates the docker networks then runs the databases
# This is used when initializing your databases
run_dbs *ARGS:
  just create_networks
  {{ database_compose }} up postgres redis --wait {{ ARGS }}

# Spins up main docker-compose
docker_up *ARGS:
  echo "startup docker compose"
  {{ compose }} up {{ ARGS }}

# Reset and seed deterministic data used by local E2E tests.
local-e2e-seed:
  just run_dbs -d
  -just crates/conation_db_client/drop_db -y -f
  just initialize_dbs
  just tooling/seed_cli/local-e2e-smoke

# Email rendering snapshots (Playwright HTML fixtures, not inbox e2e).
# Add a fixture under apps/web/src/lib/core/email/tests/fixtures, then
# `just test-email-rendering-update`.
test-email-rendering:
  just apps/web/test-email-rendering

test-email-rendering-update:
  just apps/web/test-email-rendering-update

# Apply a seed scenario (teams/perms/entities) to the local stack, e.g.
# `just seed-scenario apply --file seed/scenarios/team-perms.json`.
# Add --force to drop and re-migrate the local database first (pristine world).
# `just seed-scenario status` reports what's applied and re-prints login links.
# Pass `--instance <name>` before the scenario subcommand to target a named
# `run_local` stack. Omitting it targets the default `conation` instance.
[positional-arguments]
seed-scenario *ARGS:
  @{{ xtask }} seed-scenario "$@"

# Start only the services needed by the local E2E suites. Avoid unrelated
# local services with extra env/dependency requirements blocking E2E.
local-e2e-services := "authentication-service connection_gateway contacts_service document_storage_service email_service notification_service static_file_service static_file_cdn sync_service websocket_service"

# Update the fixed-output js node_modules hash after bun.lock changes.
update-node-modules-hash:
  tooling/scripts/update-node-modules-hash.sh

# Verify the fixed-output js node_modules derivation matches bun.lock.
check-node-modules-nix:
  nix build .#js-node-modules --no-link
  nix build .#js-node-modules --no-link --rebuild

# Stop all services in the default Conation Compose profile. The supported
# full-stack lifecycle is `just stack up` / `just stack down`.
stop-local:
  {{ compose }} down

stop-databases:
  {{ database_compose }} stop postgres redis search kafka

# Import LocalStack recipes
import 'tooling/just/local_stack.just'
import 'tooling/just/xtask.just'
import 'tooling/just/check.just'
import 'tooling/just/rust.just'
import 'tooling/just/selfhost.just'

# Sets up local database
setup_local_dbs:
  # run dbs detached
  just run_dbs -d
  just crates/conation_db_client/create_db
  just crates/conation_db_client/migrate_db
  @echo "Local databases initialized"
  {{ database_compose }} stop postgres redis

# Provision the local Conation FusionAuth profile through the generated
# standalone kickstart. This performs no Pulumi bootstrap or remote import.
setup_fusionauth:
  just stack up --no-doppler --infra-only

# The generated stack owns FusionAuth together with its dependent local
# services. A partial stop would leave an inconsistent profile.
stop_fusionauth:
  @echo "FusionAuth is managed by the Conation local stack; use 'just stack down'."
  @exit 2

# Clear all BuildKit build cache (full cold rebuild next time)
docker_cache_clear:
  docker builder prune --all -f

# Clear only the Rust target caches (keeps downloaded crates, forces recompilation)
docker_cache_clear_targets:
  docker builder prune --filter type=exec.cachemount --filter id=rust-target-dev-debug -f
  docker builder prune --filter type=exec.cachemount --filter id=rust-target-dev-release -f

# Show BuildKit cache disk usage
docker_cache_usage:
  docker builder du --verbose

setup:
  just stack up --no-doppler
  @echo "Conation local setup complete."

destroy:
  just stack down
