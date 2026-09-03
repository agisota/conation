#!/usr/bin/env bash

# Regression harness for the fail-closed FusionAuth identity check. It never
# contacts a live service: a local curl shim records every attempted request.

set -euo pipefail
umask 077

repo_root="$(\cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
provisioner="${repo_root}/tooling/scripts/provision-conation-support-users.sh"
manifest="${repo_root}/infra/stacks/fusionauth-instance/support-users.json"
test_root="$(mktemp -d)"

cleanup() {
  rm -rf -- "$test_root"
}
trap cleanup EXIT HUP INT TERM

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_count() {
  local expected="$1"
  local pattern="$2"
  local file="$3"
  local actual
  actual="$(grep -c -- "$pattern" "$file" || true)"
  [[ "$actual" == "$expected" ]] || fail "expected $expected matches for '$pattern' in $file, got $actual"
}

fake_bin="${test_root}/bin"
mkdir -p "$fake_bin"
fake_curl="${fake_bin}/curl"

cat >"$fake_curl" <<'FAKE_CURL'
#!/usr/bin/env bash

set -euo pipefail

log="${FAKE_FUSIONAUTH_LOG:?}"
expected_api_key="${FAKE_FUSIONAUTH_API_KEY:?}"
output_file=""
method="GET"
url=""
authorization_header_file_seen=false

[[ -z "${FUSIONAUTH_API_KEY:-}" ]] || {
  echo "curl inherited FUSIONAUTH_API_KEY instead of using the private header file" >&2
  exit 70
}

for argument in "$@"; do
  if [[ "$argument" == *"$expected_api_key"* ]]; then
    echo "FusionAuth API key appeared in curl argv" >&2
    exit 65
  fi
done

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --output|--request|--write-out|--header|--data|--data-urlencode)
      if [[ "$1" == "--output" ]]; then
        output_file="$2"
      elif [[ "$1" == "--request" ]]; then
        method="$2"
      elif [[ "$1" == "--header" ]]; then
        if [[ "$2" == @* ]]; then
          header_file="${2#@}"
          [[ -f "$header_file" ]] || {
            echo "curl received a missing header file" >&2
            exit 66
          }
          [[ "$(stat -c '%a' "$header_file")" == "600" ]] || {
            echo "FusionAuth header file is not private" >&2
            exit 67
          }
          grep -Fqx "Authorization: $expected_api_key" "$header_file" || {
            echo "FusionAuth header file did not contain the expected authorization header" >&2
            exit 68
          }
          authorization_header_file_seen=true
        fi
      fi
      shift 2
      ;;
    --get)
      method="GET"
      shift
      ;;
    --silent|--show-error)
      shift
      ;;
    --*)
      shift
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done

[[ -n "$output_file" ]] || exit 64
[[ "$authorization_header_file_seen" == true ]] || {
  echo "curl did not receive the FusionAuth authorization header through a file" >&2
  exit 69
}

case "${method}:${url}" in
  GET:*"/api/user")
    printf 'lookup:%s\n' "$url" >>"$log"
    printf '%s\n' '{"user":{"id":"79999999-0000-4000-8000-000000000999"}}' >"$output_file"
    printf '200'
    ;;
  *)
    printf 'mutation:%s:%s\n' "$method" "$url" >>"$log"
    printf '%s\n' '{"error":"unexpected mutation"}' >"$output_file"
    printf '500'
    ;;
esac
FAKE_CURL
chmod 700 "$fake_curl"

request_tmp="${test_root}/request-tmp"
log="${test_root}/requests.log"
output="${test_root}/provisioner.out"
mkdir -p "$request_tmp"
: >"$log"

if PATH="${fake_bin}:$PATH" \
  FAKE_FUSIONAUTH_LOG="$log" \
  TMPDIR="$request_tmp" \
  CONATION_SUPPORT_USERS_MANIFEST="$manifest" \
  FUSIONAUTH_URL="https://fusionauth.test" \
  FUSIONAUTH_API_KEY="fake-api-key-never-print" \
  FAKE_FUSIONAUTH_API_KEY="fake-api-key-never-print" \
  FUSIONAUTH_APPLICATION_ID="00000000-0000-4000-8000-000000000001" \
  CONATION_SUPPORT_AVATAR_BASE_URL="https://app.conation.test" \
  bash "$provisioner" >"$output" 2>&1
then
  fail "provisioner unexpectedly accepted a different FusionAuth ID for the support email"
fi

grep -F 'refusing to mutate the existing account' "$output" >/dev/null \
  || fail "mismatched-ID failure did not explain that mutation was refused"
assert_count 1 '^lookup:' "$log"
assert_count 0 '^mutation:' "$log"

if [[ -n "$(find "$request_tmp" -mindepth 1 -print -quit)" ]]; then
  fail "temporary FusionAuth response files were not cleaned after the fail-closed exit"
fi

echo "FusionAuth support-user identity mismatch harness: PASS"
