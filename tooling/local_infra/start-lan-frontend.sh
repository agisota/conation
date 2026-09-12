#!/usr/bin/env bash
# Hot-reload Vite on 0.0.0.0 against the running LAN operator.
# Idempotent. Does not run `just stack up` (that wipes volumes).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LOG_DIR="${HOME}/.cursor-cloud"
PID_FILE="${LOG_DIR}/conation-lan-frontend.pid"
DEV_LOG="${LOG_DIR}/conation-lan-frontend.log"
FRONTEND_PORT="${CONATION_LAN_FRONTEND_PORT:-3000}"
NIX_BIN="${NIX_BIN:-/nix/var/nix/profiles/default/bin/nix}"

mkdir -p "${LOG_DIR}"
bash "${REPO_ROOT}/scripts/macos-connect-local-server.sh" --write >/dev/null

EXAMPLE="${REPO_ROOT}/.env.desktop.local.example"
if [ -f "${REPO_ROOT}/.env.desktop.local" ]; then
  EXAMPLE="${REPO_ROOT}/.env.desktop.local"
fi
set -a
# shellcheck disable=SC1090
source "${EXAMPLE}"
set +a

OPERATOR="${CONATION_OPERATOR_ORIGIN:?}"
# localhost:8090 is dynacat on this host. Probe the named-stack proxy.
BACKEND_PORT="${CONATION_PROXY_BACKEND_PORT:-24009}"
LOCAL_HEALTH="http://127.0.0.1:${BACKEND_PORT}/auth/health"
DEV_URL="http://127.0.0.1:${FRONTEND_PORT}/app"

if curl -fsS --max-time 2 "${DEV_URL}" >/dev/null 2>&1; then
  echo "start-lan-frontend: already serving ${DEV_URL}"
  echo "start-lan-frontend: operator ${OPERATOR}"
  exit 0
fi

if ! curl -fsS --max-time 3 "${LOCAL_HEALTH}" >/dev/null 2>&1; then
  echo "start-lan-frontend: operator not healthy (${LOCAL_HEALTH})" >&2
  echo "start-lan-frontend: see /root/macro/.cursor-fleet/LOCAL_INFRA.md" >&2
  exit 1
fi

HMR_HOST="${OPERATOR#http://}"
HMR_HOST="${HMR_HOST%%:*}"

WEB_DIR="${REPO_ROOT}/apps/web"
if [ ! -d "${WEB_DIR}/node_modules" ] && [ -d /root/macro/apps/web/node_modules ]; then
  ln -sfn /root/macro/apps/web/node_modules "${WEB_DIR}/node_modules"
fi

BUN_BIN="$(command -v bun || true)"
if [ -z "${BUN_BIN}" ]; then
  echo "start-lan-frontend: bun not on PATH; using nix develop" >&2
  VITE_CMD=("${NIX_BIN}" develop "${REPO_ROOT}" --command bunx --bun vite -c vite.config.ts)
else
  VITE_CMD=("${BUN_BIN}" x --bun vite -c vite.config.ts)
fi

: >"${DEV_LOG}"
setsid env \
  PORT="${FRONTEND_PORT}" \
  TAURI_DEV_HOST="${HMR_HOST}" \
  CONATION_CLIENT_PROFILE=standalone \
  CONATION_OPERATOR_ORIGIN="${OPERATOR}" \
  VITE_CONATION_CLIENT_PROFILE=standalone \
  VITE_CONATION_OPERATOR_ORIGIN="${OPERATOR}" \
  VITE_LOCAL_BACKEND_ORIGIN="${OPERATOR}" \
  VITE_AI_EDITING_WORKER_URL="${OPERATOR}/ai-editing" \
  bash -c "cd '${WEB_DIR}' && exec $(printf '%q ' "${VITE_CMD[@]}")" \
  >>"${DEV_LOG}" 2>&1 </dev/null &
echo "$!" >"${PID_FILE}"

n=0
while [ "${n}" -lt 180 ]; do
  if ! kill -0 "$(cat "${PID_FILE}")" 2>/dev/null; then
    echo "start-lan-frontend: vite exited during startup" >&2
    tail -50 "${DEV_LOG}" >&2 || true
    rm -f "${PID_FILE}"
    exit 1
  fi
  if curl -fsS --max-time 2 "${DEV_URL}" >/dev/null 2>&1; then
    echo "start-lan-frontend: ${DEV_URL}"
    echo "start-lan-frontend: operator ${OPERATOR}"
    echo "start-lan-frontend: logs ${DEV_LOG}"
    exit 0
  fi
  n=$((n + 1))
  sleep 1
done

echo "start-lan-frontend: vite did not become ready" >&2
tail -50 "${DEV_LOG}" >&2 || true
exit 1
