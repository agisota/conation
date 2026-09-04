#!/usr/bin/bash -p
# Read-only operator checks for the already-running supported local stack.
set -euo pipefail

proxy_origin="${SELFHOST_PROXY_ORIGIN:-http://localhost:8090}"
frontend_origin="${SELFHOST_FRONTEND_ORIGIN:-http://localhost:3000}"
localstack_origin="${SELFHOST_LOCALSTACK_ORIGIN:-http://localhost:4566}"
connect_timeout_seconds="${SELFHOST_SMOKE_CONNECT_TIMEOUT_SECONDS:-3}"
request_timeout_seconds="${SELFHOST_SMOKE_REQUEST_TIMEOUT_SECONDS:-10}"

fail() {
    printf 'selfhost-smoke: %s\n' "$*" >&2
    exit 1
}

require_no_control_characters() {
    local name="$1"
    local value="$2"

    if [[ "$value" =~ [[:cntrl:]] ]]; then
        fail "$name must not contain control characters"
    fi
}

require_origin() {
    local name="$1"
    local origin="$2"

    require_no_control_characters "$name" "$origin"
    if [[ ! "$origin" =~ ^https?://[^/?#@[:space:]]+$ ]]; then
        fail "$name must be an http(s) origin without a path, query, fragment, or credentials"
    fi
}

require_positive_integer() {
    local name="$1"
    local value="$2"

    require_no_control_characters "$name" "$value"
    if [[ ! "$value" =~ ^[1-9][0-9]*$ ]]; then
        fail "$name must be a positive integer"
    fi
}

request_status() {
    local label="$1"
    local url="$2"
    local status

    printf 'Checking %s: %s\n' "$label" "$url" >&2
    if ! status="$(/usr/bin/curl \
        --disable \
        --globoff \
        --silent \
        --show-error \
        --output /dev/null \
        --write-out '%{http_code}' \
        --request GET \
        --connect-timeout "$connect_timeout_seconds" \
        --max-time "$request_timeout_seconds" \
        --max-redirs 0 \
        --proto '=http,https' \
        --noproxy '*' \
        --proto-redir '=http,https' \
        "$url")"; then
        fail "$label request failed. Confirm the supported local stack is already running and that the endpoint override is reachable."
    fi

    printf '%s' "$status"
}

require_success() {
    local label="$1"
    local url="$2"
    local status

    status="$(request_status "$label" "$url")"
    if [[ ! "$status" =~ ^2[0-9][0-9]$ ]]; then
        fail "$label returned HTTP $status; expected a 2xx response from $url"
    fi
    printf 'PASS %s (HTTP %s)\n' "$label" "$status"
}

require_exact_status() {
    local label="$1"
    local expected_status="$2"
    local url="$3"
    local status

    status="$(request_status "$label" "$url")"
    if [[ "$status" != "$expected_status" ]]; then
        fail "$label returned HTTP $status; expected HTTP $expected_status from $url"
    fi
    printf 'PASS %s (HTTP %s)\n' "$label" "$status"
}

require_origin "SELFHOST_PROXY_ORIGIN" "$proxy_origin"
require_origin "SELFHOST_FRONTEND_ORIGIN" "$frontend_origin"
require_origin "SELFHOST_LOCALSTACK_ORIGIN" "$localstack_origin"
require_positive_integer "SELFHOST_SMOKE_CONNECT_TIMEOUT_SECONDS" "$connect_timeout_seconds"
require_positive_integer "SELFHOST_SMOKE_REQUEST_TIMEOUT_SECONDS" "$request_timeout_seconds"

require_success "auth health" "${proxy_origin%/}/auth/health"
require_success "scheduled-action health" "${proxy_origin%/}/scheduled-action/health"
require_success "OAuth protected-resource metadata" "${proxy_origin%/}/.well-known/oauth-protected-resource/mcp"
require_exact_status "MCP endpoint" "401" "${proxy_origin%/}/mcp"
require_success "LocalStack health" "${localstack_origin%/}/_localstack/health"
require_exact_status "browser-facing app redirect" "308" "${frontend_origin%/}/app"
require_success "browser-facing app" "${frontend_origin%/}/app/"

printf 'selfhost-smoke: all read-only endpoint assertions passed.\n'
