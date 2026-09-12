#!/usr/bin/env bash
# Make Conation reachable at :8090 on this server's network IPs.
#
# localhost:8090 is dynacat — do not steal it.
# Public IPv4:8090 is forwarded to the live operator (conation-dev :24009).
# Tailscale TCP 8090 is retargeted from dynacat to that same operator.
#
# Idempotent. Does not run `just stack up` (that wipes volumes).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${HOME}/.cursor-cloud"
PID_FILE="${LOG_DIR}/conation-8090-forward.pid"
LOG_FILE="${LOG_DIR}/conation-8090-forward.log"
PUBLIC_IP="${CONATION_PUBLIC_IP:-173.212.222.197}"
PROXY_PORT="${CONATION_PROXY_PORT:-24009}"
LAN_PORT="${CONATION_LAN_8090_PORT:-8090}"
OPERATOR_LOOPBACK="http://127.0.0.1:${PROXY_PORT}/auth/health"

mkdir -p "${LOG_DIR}"

if ! curl -fsS --max-time 3 "${OPERATOR_LOOPBACK}" >/dev/null 2>&1; then
  echo "serve-operator-8090: operator not healthy at ${OPERATOR_LOOPBACK}" >&2
  echo "serve-operator-8090: start the named stack (conation-dev) first; do not run stack.sh while localhost:8090 is dynacat" >&2
  exit 1
fi

if command -v ufw >/dev/null 2>&1; then
  ufw allow "${LAN_PORT}/tcp" comment "conation operator via 8090 forwarder" >/dev/null || true
fi

if command -v tailscale >/dev/null 2>&1; then
  # Restore dynacat later with: tailscale serve --bg --tcp 8090 tcp://127.0.0.1:8090
  tailscale serve --bg --tcp "${LAN_PORT}" "tcp://127.0.0.1:${PROXY_PORT}" >/dev/null
  echo "serve-operator-8090: tailscale TCP :${LAN_PORT} -> 127.0.0.1:${PROXY_PORT}"
fi

already_ok=0
if curl -fsS --max-time 3 "http://${PUBLIC_IP}:${LAN_PORT}/auth/health" >/dev/null 2>&1; then
  already_ok=1
fi

if [ "${already_ok}" -eq 1 ]; then
  echo "serve-operator-8090: public ${PUBLIC_IP}:${LAN_PORT} already healthy"
else
  if [ -f "${PID_FILE}" ] && kill -0 "$(cat "${PID_FILE}")" 2>/dev/null; then
    echo "serve-operator-8090: forwarder pid $(cat "${PID_FILE}") alive but health failed" >&2
  else
    : >"${LOG_FILE}"
    nohup python3 "${SCRIPT_DIR}/forward-8090.py" >>"${LOG_FILE}" 2>&1 </dev/null &
    echo "$!" >"${PID_FILE}"
    echo "serve-operator-8090: started pid $(cat "${PID_FILE}")"
  fi
  n=0
  while [ "${n}" -lt 20 ]; do
    if curl -fsS --max-time 2 "http://${PUBLIC_IP}:${LAN_PORT}/auth/health" >/dev/null 2>&1; then
      already_ok=1
      break
    fi
    n=$((n + 1))
    sleep 0.25
  done
fi

if [ "${already_ok}" -ne 1 ]; then
  echo "serve-operator-8090: public ${PUBLIC_IP}:${LAN_PORT} still unhealthy" >&2
  tail -20 "${LOG_FILE}" >&2 || true
  exit 1
fi

echo "serve-operator-8090: http://${PUBLIC_IP}:${LAN_PORT}/auth/health"
if command -v tailscale >/dev/null 2>&1; then
  TS_IP="$(tailscale ip -4 2>/dev/null | head -n1 || true)"
  if [ -n "${TS_IP}" ]; then
    echo "serve-operator-8090: http://${TS_IP}:${LAN_PORT}/auth/health"
  fi
fi
