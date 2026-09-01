# Self-host recipes for Conation (single server)
# Requires .env.selfhost (see .env.selfhost.example)

selfhost-up *ARGS:
    #!/usr/bin/env bash
    set -euo pipefail
    ENV_FILE="${ENV_FILE:-.env.selfhost}"
    if [ ! -f "$ENV_FILE" ]; then
      echo "Missing $ENV_FILE — cp .env.selfhost.example $ENV_FILE and edit"
      exit 1
    fi
    echo "Starting Conation self-host ($ENV_FILE) ..."
    docker compose -f docker/docker-compose-databases.yml --env-file "$ENV_FILE" up -d
    sleep 5
    docker compose -f docker/docker-compose.yml -f docker/docker-compose.selfhost.yml --env-file "$ENV_FILE" up -d {{ARGS}}
    echo "Conation UP: https://${CONATION_DOMAIN:-conation.dev}  MinIO http://localhost:9001  Stalwart http://localhost:8081"

selfhost-down:
    docker compose -f docker/docker-compose.yml -f docker/docker-compose.selfhost.yml down

selfhost-logs *ARGS:
    docker compose -f docker/docker-compose.yml -f docker/docker-compose.selfhost.yml logs -f {{ARGS}}

selfhost-backup:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p backup
    echo "pg_dump conationdb..."
    docker exec $(docker ps -qf name=postgres) pg_dump -U user conationdb > backup/conationdb-$(date +%Y%m%d).sql || pg_dump postgres://user:password@localhost:5432/conationdb > backup/conationdb-$(date +%Y%m%d).sql
    echo "MinIO mirror..."
    docker exec minio mc mirror /data ./backup/minio 2>/dev/null || echo "mc mirror skip (install mc)"
    echo "backup -> backup/"

selfhost-setup-dns:
    @echo "Add to DNS:"
    @echo "  A conation.dev -> $(curl -s ifconfig.me || echo '<SERVER_IP>')"
    @echo "  MX conation.dev 10 mail.conation.dev"
    @echo "  TXT conation.dev \"v=spf1 ip4:$(curl -s ifconfig.me) ~all\""
    @echo "See infra/selfhost/README.md for DKIM/DMARC"

selfhost-prepare-db:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Running migrations for conationdb..."
    DATABASE_URL=postgres://user:password@localhost:5432/conationdb cargo run -p conation_db_client --bin migrate 2>/dev/null || just setup_macrodb
    echo "prepare_db (sqlx offline cache)..."
    nix develop --command just prepare_db || cargo sqlx prepare 2>/dev/null || echo "sqlx prepare skipped (need DB)"

selfhost-check:
    docker compose -f docker/docker-compose.yml -f docker/docker-compose.selfhost.yml --env-file .env.selfhost config > /dev/null && echo "compose config OK"
    rg -i "macro\.com|macro-inc" --hidden -g '!.git' infra/ apps/web/src/lib/i18n 2>/dev/null | wc -l | xargs echo "remaining macro refs:"
