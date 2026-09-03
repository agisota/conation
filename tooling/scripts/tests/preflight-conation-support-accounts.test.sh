#!/usr/bin/env bash

# Regression harness for the read-only Conation support-account preflight. It
# uses curl and psql shims only; no network connection or database is needed.

set -euo pipefail
umask 077

repo_root="$(\cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
preflight="${repo_root}/tooling/scripts/preflight-conation-support-accounts.sh"
test_root="$(mktemp -d)"

cleanup() {
  rm -rf -- "$test_root"
}
trap cleanup EXIT HUP INT TERM

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_contains() {
  local expected="$1"
  local file="$2"
  grep -F -- "$expected" "$file" >/dev/null || fail "expected '$expected' in $file"
}

fake_bin="${test_root}/bin"
mkdir -p "$fake_bin"

cat >"${fake_bin}/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
set -euo pipefail

log="${FAKE_FUSIONAUTH_LOG:?}"
expected_api_key="${FAKE_FUSIONAUTH_API_KEY:?}"
expected_webhook_key="${FAKE_WEBHOOK_KEY:?}"
application_id="${FUSIONAUTH_APPLICATION_ID:?}"
avatar_base_url="${CONATION_SUPPORT_AVATAR_BASE_URL:?}"
output_file=""
method="GET"
url=""
email=""
header_seen=false

[[ -z "${FUSIONAUTH_API_KEY:-}" ]] || {
  echo "curl inherited FUSIONAUTH_API_KEY instead of a private header file" >&2
  exit 70
}
[[ -z "${CONATION_SUPPORT_PREFLIGHT_WEBHOOK_KEY:-}" ]] || {
  echo "curl inherited CONATION_SUPPORT_PREFLIGHT_WEBHOOK_KEY" >&2
  exit 78
}

for argument in "$@"; do
  if [[ "$argument" == *"$expected_api_key"* ]]; then
    echo "FusionAuth API key appeared in curl argv" >&2
    exit 71
  fi
done

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --output|--write-out|--request|--header|--data-urlencode|--max-time)
      case "$1" in
        --output) output_file="$2" ;;
        --request) method="$2" ;;
        --header)
          if [[ "$2" == @* ]]; then
            header_file="${2#@}"
            [[ -f "$header_file" ]] || {
              echo "curl received a missing header file" >&2
              exit 72
            }
            [[ "$(stat -c '%a' "$header_file")" == "600" ]] || {
              echo "FusionAuth header file is not private" >&2
              exit 73
            }
            grep -Fqx "Authorization: $expected_api_key" "$header_file" || {
              echo "FusionAuth header file did not contain the expected key" >&2
              exit 74
            }
            header_seen=true
          fi
          ;;
        --data-urlencode)
          if [[ "$2" == email=* ]]; then
            email="${2#email=}"
          fi
          ;;
      esac
      shift 2
      ;;
    --get|--silent|--show-error|--fail)
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

if [[ "$url" == "${CONATION_AUTH_HEALTH_URL}" ]]; then
  printf 'health:%s\n' "$url" >>"$log"
  exit 0
fi

[[ -n "$output_file" ]] || {
  echo "FusionAuth request did not select an output file" >&2
  exit 75
}
[[ "$header_seen" == true ]] || {
  echo "FusionAuth request did not receive the private header file" >&2
  exit 76
}
[[ "$method" == "GET" ]] || {
  echo "preflight attempted a non-GET FusionAuth request: $method" >&2
  exit 77
}

printf '%s:%s:%s\n' "$method" "$url" "$email" >>"$log"

write_response() {
  local body="$1"
  local status="$2"
  printf '%s\n' "$body" >"$output_file"
  printf '%s' "$status"
}

case "$url" in
  "https://fusionauth.test/api/application/${application_id}")
    write_response "$(jq -cn --arg application_id "$application_id" '{application: {id: $application_id, tenantId: "tenant-1"}}')" 200
    ;;
  "https://fusionauth.test/api/tenant/tenant-1")
    write_response '{"tenant":{"eventConfiguration":{"events":{"user.create":{"enabled":true,"transactionType":"AbsoluteMajority"},"user.create.complete":{"enabled":true,"transactionType":"None"}}}}}' 200
    ;;
  "https://fusionauth.test/api/webhook")
    write_response "$(jq -cn --arg webhook_key "$expected_webhook_key" '{webhooks: [{url: "http://authentication-service:8080/webhooks/user", global: true, eventsEnabled: {"user.create": true, "user.create.complete": true}, headers: {"x-internal-auth-key": $webhook_key}}]}')" 200
    ;;
  "https://fusionauth.test/api/user")
    case "$email" in
      pythia@conation.dev)
        user_id="70000000-0000-4000-8000-000000000001"
        username="pythia"
        first_name="Пифия"
        last_name=""
        full_name="Пифия"
        role="Служба поддержки"
        avatar="/support-avatars/pythia.svg"
        ;;
      tars@conation.dev)
        user_id="70000000-0000-4000-8000-000000000002"
        username="tars"
        first_name="Тарс"
        last_name=""
        full_name="Тарс"
        role="Технический директор"
        avatar="/support-avatars/tars.svg"
        ;;
      ramzan.kadyrov@conation.dev)
        user_id="70000000-0000-4000-8000-000000000003"
        username="ramzan.kadyrov"
        first_name="Рамзан"
        last_name="Кадыров"
        full_name="Рамзан Кадыров"
        role="Генеральный директор"
        avatar="/support-avatars/ramzan-kadyrov.svg"
        ;;
      *)
        write_response '{"error":"unknown user"}' 404
        exit 0
        ;;
    esac
    if [[ "${FAKE_WRONG_USER_EMAIL:-}" == "$email" ]]; then
      user_id="79999999-0000-4000-8000-000000000999"
    fi
    write_response "$(jq -cn \
      --arg id "$user_id" \
      --arg email "$email" \
      --arg username "$username" \
      --arg first_name "$first_name" \
      --arg last_name "$last_name" \
      --arg full_name "$full_name" \
      --arg role "$role" \
      --arg avatar_url "${avatar_base_url}${avatar}" '
        {user: ({
          id: $id,
          active: true,
          email: $email,
          username: $username,
          firstName: $first_name,
          fullName: $full_name,
          imageUrl: $avatar_url,
          verified: true,
          data: {conation: {locale: "ru", role: $role, supportAccount: true, canReply: true}}
        } + (if $last_name == "" then {} else {lastName: $last_name} end))}
      ')" 200
    ;;
  "https://fusionauth.test/api/user/registration/"*)
    write_response "$(jq -cn --arg application_id "$application_id" '{registration: {applicationId: $application_id}}')" 200
    ;;
  *)
    write_response '{"error":"unexpected endpoint"}' 404
    ;;
esac
FAKE_CURL
chmod 700 "${fake_bin}/curl"

cat >"${fake_bin}/psql" <<'FAKE_PSQL'
#!/usr/bin/env bash
set -euo pipefail

log="${FAKE_PSQL_LOG:?}"
query="$(cat)"
[[ "$PGSERVICE" == "conation-support-readonly" ]] || {
  echo "unexpected PGSERVICE: ${PGSERVICE:-}" >&2
  exit 80
}
[[ "$PGOPTIONS" == "-c default_transaction_read_only=on" ]] || {
  echo "runtime preflight did not force read-only PostgreSQL options" >&2
  exit 81
}
grep -F 'BEGIN READ ONLY;' <<<"$query" >/dev/null || {
  echo "runtime preflight did not begin a read-only transaction" >&2
  exit 82
}
grep -F "lower(:'probe_email')" <<<"$query" >/dev/null || {
  echo "runtime preflight did not safely quote the probe email" >&2
  exit 83
}
for argument in "$@"; do
  [[ "$argument" != *postgres* ]] || {
    echo "database URL appeared in psql argv" >&2
    exit 84
  }
done
printf 'psql:read-only\n' >>"$log"
printf '%s\n' '{"probeProfile":true,"supportProfiles":true,"supportChannel":true,"pythiaWelcome":true}'
FAKE_PSQL
chmod 700 "${fake_bin}/psql"

fusionauth_log="${test_root}/fusionauth.log"
psql_log="${test_root}/psql.log"
static_output="${test_root}/static.out"
online_output="${test_root}/online.out"
runtime_output="${test_root}/runtime.out"
bad_identity_output="${test_root}/bad-identity.out"
: >"$fusionauth_log"
: >"$psql_log"

common_env=(
  "PATH=${fake_bin}:$PATH"
  "FAKE_FUSIONAUTH_LOG=${fusionauth_log}"
  "FAKE_FUSIONAUTH_API_KEY=fake-api-key-never-print"
  "FAKE_WEBHOOK_KEY=fake-webhook-key-never-print"
  "FUSIONAUTH_URL=https://fusionauth.test"
  "FUSIONAUTH_API_KEY=fake-api-key-never-print"
  "FUSIONAUTH_APPLICATION_ID=00000000-0000-4000-8000-000000000001"
  "CONATION_SUPPORT_AVATAR_BASE_URL=https://app.conation.test"
  "CONATION_AUTH_HEALTH_URL=https://app.conation.test/auth/health"
)

env -u FUSIONAUTH_URL \
  -u FUSIONAUTH_API_KEY \
  -u FUSIONAUTH_APPLICATION_ID \
  -u CONATION_SUPPORT_AVATAR_BASE_URL \
  -u CONATION_AUTH_HEALTH_URL \
  "PATH=${fake_bin}:$PATH" \
  "FAKE_FUSIONAUTH_LOG=${fusionauth_log}" \
  "FAKE_FUSIONAUTH_API_KEY=fake-api-key-never-print" \
  "FAKE_WEBHOOK_KEY=fake-webhook-key-never-print" \
  bash "$preflight" --static >"$static_output" 2>&1
assert_contains 'RESULT: STATIC SUPPORT PREFLIGHT PASS' "$static_output"
[[ ! -s "$fusionauth_log" ]] || fail '--static unexpectedly called curl'

if ! env "${common_env[@]}" \
  CONATION_SUPPORT_PREFLIGHT_WEBHOOK_KEY='fake-webhook-key-never-print' \
  bash "$preflight" --online >"$online_output" 2>&1
then
  sed -n '1,160p' "$online_output" >&2
  fail 'online preflight unexpectedly failed against the complete FusionAuth fixture'
fi
assert_contains 'RESULT: ONLINE SUPPORT PREFLIGHT PASS' "$online_output"
assert_contains 'PASS: FusionAuth webhook internal-auth header matches the supplied operator secret' "$online_output"
assert_contains 'NOT VERIFIED: database profiles, active channel memberships, and welcome delivery require --runtime' "$online_output"
grep -Ev '^(GET:|health:)' "$fusionauth_log" >/dev/null && fail 'preflight attempted a non-GET FusionAuth operation'

if ! env "${common_env[@]}" \
  "FAKE_PSQL_LOG=${psql_log}" \
  CONATION_SUPPORT_PREFLIGHT_WEBHOOK_KEY='fake-webhook-key-never-print' \
  CONATION_SUPPORT_PREFLIGHT_PG_SERVICE='conation-support-readonly' \
  CONATION_SUPPORT_PREFLIGHT_PROBE_EMAIL='new.user@conation.test' \
  bash "$preflight" --runtime >"$runtime_output" 2>&1
then
  sed -n '1,160p' "$runtime_output" >&2
  fail 'runtime preflight unexpectedly failed against the complete fixture'
fi
assert_contains 'RESULT: RUNTIME SUPPORT PREFLIGHT PASS' "$runtime_output"
assert_contains 'PASS: read-only runtime probe found support profiles, active channel membership, and Pythia welcome' "$runtime_output"
assert_contains 'psql:read-only' "$psql_log"

if env "${common_env[@]}" \
  FAKE_WRONG_USER_EMAIL='pythia@conation.dev' \
  bash "$preflight" --online >"$bad_identity_output" 2>&1
then
  fail 'preflight accepted a support account with the wrong FusionAuth UUID'
fi
assert_contains 'FusionAuth support profile is incomplete or has unexpected identity data for pythia@conation.dev' "$bad_identity_output"

for secret in fake-api-key-never-print fake-webhook-key-never-print; do
  if grep -R -F -- "$secret" \
    "$static_output" \
    "$online_output" \
    "$runtime_output" \
    "$bad_identity_output" \
    "$fusionauth_log" \
    "$psql_log" >/dev/null
  then
    fail "secret leaked to a preflight output or test log"
  fi
done

echo 'Conation support-account preflight harness: PASS'
