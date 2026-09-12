#!/usr/bin/env bash
# Fake docker + curl harness for stack-diagnose.sh. No live stack is contacted.

set -euo pipefail

repo_root="$(\cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
script="${repo_root}/tooling/scripts/stack-diagnose.sh"
test_root="$(mktemp -d)"

cleanup() {
    rm -rf -- "$test_root"
}
trap cleanup EXIT HUP INT TERM

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

fake_bin="${test_root}/bin"
mkdir -p "$fake_bin"

cat >"${fake_bin}/docker" <<'FAKE_DOCKER'
#!/usr/bin/env bash
set -euo pipefail
case "${1:-}" in
    info)
        echo "27.0.0"
        exit 0
        ;;
    ps)
        service=""
        while [[ "$#" -gt 0 ]]; do
            if [[ "$1" == --filter ]]; then
                shift
                case "${1:-}" in
                    label=com.docker.compose.service=postgres) service=postgres ;;
                    label=com.docker.compose.service=redis) service=redis ;;
                    label=com.docker.compose.service=fusionauth) service=fusionauth ;;
                esac
            fi
            shift || true
        done
        case "$service" in
            postgres) echo abc111 ;;
            redis) echo abc222 ;;
            fusionauth)
                if [[ "${FAKE_FUSIONAUTH_CONTAINER:-}" == "1" ]]; then
                    echo abc333
                fi
                ;;
        esac
        exit 0
        ;;
    *)
        echo "unexpected docker $*" >&2
        exit 90
        ;;
esac
FAKE_DOCKER
chmod +x "${fake_bin}/docker"

cat >"${fake_bin}/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
set -euo pipefail
url=""
while [[ "$#" -gt 0 ]]; do
    case "$1" in
        --write-out) shift ;;
        --output|--request|--connect-timeout|--max-time|--max-redirs|--proto|--proto-redir) shift ;;
        http://*|https://*) url="$1" ;;
    esac
    shift || true
done
case "$url" in
    */auth/health) printf '200' ;;
    */_localstack/health) printf '200' ;;
    */app) printf '308' ;;
    */api/status) printf '200' ;;
    */api/v1/info) printf '200' ;;
    */) printf '302' ;;
    *)
        echo "unexpected curl $url" >&2
        exit 91
        ;;
esac
FAKE_CURL
chmod +x "${fake_bin}/curl"

run_script() {
    /usr/bin/env -i \
        PATH="/usr/bin:/bin" \
        FAKE_FUSIONAUTH_CONTAINER="${FAKE_FUSIONAUTH_CONTAINER-}" \
        SELFHOST_DIAGNOSE_CURL="${fake_bin}/curl" \
        SELFHOST_DIAGNOSE_DOCKER="${fake_bin}/docker" \
        SELFHOST_PROXY_ORIGIN=http://localhost:8090 \
        SELFHOST_FRONTEND_ORIGIN=http://localhost:3000 \
        SELFHOST_LOCALSTACK_ORIGIN=http://localhost:4566 \
        SELFHOST_FUSIONAUTH_ORIGIN=http://localhost:9011 \
        SELFHOST_MAILPIT_ORIGIN=http://localhost:8025 \
        SELFHOST_STALWART_ORIGIN="${SELFHOST_STALWART_ORIGIN-}" \
        SELFHOST_STACK_PROJECT=conation \
        /usr/bin/bash "$script"
}

out="${test_root}/out.txt"
if ! FAKE_FUSIONAUTH_CONTAINER=1 SELFHOST_STALWART_ORIGIN=http://localhost:18081 \
    run_script >"$out" 2>&1; then
    cat "$out" >&2
    fail "healthy fake stack should pass"
fi
grep -F 'PASS docker daemon' "$out" >/dev/null || fail "missing docker pass"
grep -F 'PASS container postgres' "$out" >/dev/null || fail "missing postgres pass"
grep -F 'PASS container redis' "$out" >/dev/null || fail "missing redis pass"
grep -F 'PASS auth health' "$out" >/dev/null || fail "missing auth pass"
grep -F 'PASS Stalwart HTTP (HTTP 302)' "$out" >/dev/null || fail "Stalwart bootstrap 302 should pass"
grep -F 'stack-diagnose: required checks passed.' "$out" >/dev/null || fail "missing success footer"

if /usr/bin/env -i \
    PATH="/usr/bin:/bin" \
    SELFHOST_DIAGNOSE_CURL="${fake_bin}/curl" \
    SELFHOST_DIAGNOSE_DOCKER="${fake_bin}/docker" \
    SELFHOST_PROXY_ORIGIN='http://user:pass@localhost:8090' \
    /usr/bin/bash "$script" >"${test_root}/bad.txt" 2>&1; then
    fail "credentials in origin must be rejected"
fi
grep -F 'must be an http(s) origin' "${test_root}/bad.txt" >/dev/null \
    || fail "expected origin validation error"

echo "stack-diagnose tests passed"
