#!/usr/bin/bash -p
# Read-only diagnosis of the already-running supported local stack.
# Reports every check (does not fail-fast). Exit 1 if any required check fails.
set -euo pipefail

proxy_origin="${SELFHOST_PROXY_ORIGIN:-http://localhost:8090}"
frontend_origin="${SELFHOST_FRONTEND_ORIGIN:-http://localhost:3000}"
localstack_origin="${SELFHOST_LOCALSTACK_ORIGIN:-http://localhost:4566}"
fusionauth_origin="${SELFHOST_FUSIONAUTH_ORIGIN:-http://localhost:9011}"
mailpit_origin="${SELFHOST_MAILPIT_ORIGIN:-http://localhost:8025}"
stalwart_origin="${SELFHOST_STALWART_ORIGIN:-}"
connect_timeout_seconds="${SELFHOST_DIAGNOSE_CONNECT_TIMEOUT_SECONDS:-3}"
request_timeout_seconds="${SELFHOST_DIAGNOSE_REQUEST_TIMEOUT_SECONDS:-10}"
stack_project="${SELFHOST_STACK_PROJECT:-conation}"
curl_bin="${SELFHOST_DIAGNOSE_CURL:-/usr/bin/curl}"
docker_bin="${SELFHOST_DIAGNOSE_DOCKER:-docker}"

fail_count=0

fail() {
    printf 'stack-diagnose: %s\n' "$*" >&2
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

record() {
    local status="$1"
    local name="$2"
    local detail="$3"

    printf '%s %s (%s)\n' "$status" "$name" "$detail"
    if [[ "$status" == 'FAIL' ]]; then
        fail_count=$((fail_count + 1))
    fi
}

request_status() {
    local url="$1"
    local status

    if ! status="$("$curl_bin" \
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
        printf 'unreachable'
        return 0
    fi
    printf '%s' "$status"
}

check_required_http() {
    local name="$1"
    local url="$2"
    local expected="$3"
    local status

    status="$(request_status "$url")"
    if [[ "$status" == 'unreachable' ]]; then
        record FAIL "$name" "unreachable $url"
        return
    fi
    if [[ "$status" == "$expected" ]]; then
        record PASS "$name" "HTTP $status"
        return
    fi
    record FAIL "$name" "HTTP $status; expected $expected from $url"
}

check_optional_http() {
    local name="$1"
    local url="$2"
    local status

    status="$(request_status "$url")"
    if [[ "$status" == 'unreachable' ]]; then
        record WARN "$name" "unreachable $url"
        return
    fi
    if [[ "$status" =~ ^[23][0-9][0-9]$ ]]; then
        record PASS "$name" "HTTP $status"
        return
    fi
    record WARN "$name" "HTTP $status from $url"
}

check_docker() {
    local version

    if ! version="$("$docker_bin" info --format '{{.ServerVersion}}' 2>/dev/null)"; then
        record FAIL 'docker daemon' 'docker info failed'
        return
    fi
    record PASS 'docker daemon' "${version:-ok}"
}

check_compose_service() {
    local service="$1"
    local required="$2"
    local ids
    local count

    mapfile -t ids < <(
        "$docker_bin" ps -q \
            --filter "label=com.docker.compose.project=${stack_project}" \
            --filter "label=com.docker.compose.service=${service}"
    )
    count="${#ids[@]}"
    if [[ "$count" -eq 1 ]]; then
        record PASS "container ${service}" "${ids[0]}"
        return
    fi
    if [[ "$required" == 'required' ]]; then
        record FAIL "container ${service}" "expected 1 running in project ${stack_project}; found ${count}"
        return
    fi
    record WARN "container ${service}" "expected 1 running in project ${stack_project}; found ${count}"
}

require_origin "SELFHOST_PROXY_ORIGIN" "$proxy_origin"
require_origin "SELFHOST_FRONTEND_ORIGIN" "$frontend_origin"
require_origin "SELFHOST_LOCALSTACK_ORIGIN" "$localstack_origin"
require_origin "SELFHOST_FUSIONAUTH_ORIGIN" "$fusionauth_origin"
require_origin "SELFHOST_MAILPIT_ORIGIN" "$mailpit_origin"
if [[ -n "$stalwart_origin" ]]; then
    require_origin "SELFHOST_STALWART_ORIGIN" "$stalwart_origin"
fi
require_positive_integer "SELFHOST_DIAGNOSE_CONNECT_TIMEOUT_SECONDS" "$connect_timeout_seconds"
require_positive_integer "SELFHOST_DIAGNOSE_REQUEST_TIMEOUT_SECONDS" "$request_timeout_seconds"
require_no_control_characters "SELFHOST_STACK_PROJECT" "$stack_project"
require_no_control_characters "SELFHOST_DIAGNOSE_CURL" "$curl_bin"
require_no_control_characters "SELFHOST_DIAGNOSE_DOCKER" "$docker_bin"
if [[ ! "$stack_project" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
    fail "SELFHOST_STACK_PROJECT must be a Compose project name"
fi
if [[ ! -x "$curl_bin" ]]; then
    fail "SELFHOST_DIAGNOSE_CURL is not executable: $curl_bin"
fi

check_docker
check_compose_service postgres required
check_compose_service redis required
check_compose_service fusionauth optional

check_required_http 'auth health' "${proxy_origin%/}/auth/health" '200'
check_required_http 'LocalStack health' "${localstack_origin%/}/_localstack/health" '200'
check_required_http 'browser-facing app redirect' "${frontend_origin%/}/app" '308'
check_optional_http 'FusionAuth' "${fusionauth_origin%/}/api/status"
check_optional_http 'Mailpit' "${mailpit_origin%/}/api/v1/info"
if [[ -n "$stalwart_origin" ]]; then
    # Bootstrap often 302s to the setup form; treat 2xx/3xx as present.
    check_optional_http 'Stalwart HTTP' "${stalwart_origin%/}/"
fi

if [[ "$fail_count" -gt 0 ]]; then
    printf 'stack-diagnose: %s required check(s) failed.\n' "$fail_count" >&2
    exit 1
fi
printf 'stack-diagnose: required checks passed.\n'
