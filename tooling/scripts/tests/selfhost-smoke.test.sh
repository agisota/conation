#!/usr/bin/env bash
# Fake-curl harness for the optional Stalwart bootstrap check in selfhost-smoke.

set -euo pipefail

repo_root="$(\cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
script="${repo_root}/tooling/scripts/selfhost-smoke.sh"
test_root="$(mktemp -d)"

cleanup() {
    rm -rf -- "$test_root"
}
trap cleanup EXIT HUP INT TERM

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

fake_curl="${test_root}/curl"
cat >"$fake_curl" <<'FAKE_CURL'
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
    */scheduled-action/health) printf '200' ;;
    */.well-known/oauth-protected-resource/mcp) printf '200' ;;
    */mcp) printf '401' ;;
    */_localstack/health) printf '200' ;;
    */app) printf '308' ;;
    */app/) printf '200' ;;
    */) printf '302' ;;
    *)
        echo "unexpected curl $url" >&2
        exit 91
        ;;
esac
FAKE_CURL
chmod +x "$fake_curl"

patched="${test_root}/selfhost-smoke.sh"
sed "s|/usr/bin/curl|${fake_curl}|g" "$script" >"$patched"

out="${test_root}/out.txt"
if ! /usr/bin/env -i \
    PATH="/usr/bin:/bin" \
    SELFHOST_PROXY_ORIGIN=http://localhost:8090 \
    SELFHOST_FRONTEND_ORIGIN=http://localhost:3000 \
    SELFHOST_LOCALSTACK_ORIGIN=http://localhost:4566 \
    SELFHOST_STALWART_ORIGIN=http://localhost:18081 \
    /usr/bin/bash "$patched" >"$out" 2>&1; then
    cat "$out" >&2
    fail "smoke with Stalwart 302 should pass"
fi
grep -F 'PASS Stalwart HTTP (HTTP 302)' "$out" >/dev/null \
    || fail "expected Stalwart bootstrap redirect to pass"

echo "selfhost-smoke tests passed"
