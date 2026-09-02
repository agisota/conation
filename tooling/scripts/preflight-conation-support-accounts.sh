#!/usr/bin/env bash

# Read-only operator preflight for the Conation support-account contract.
#
# This deliberately does not create users, registrations, channels, messages,
# or database rows. `--online` reads FusionAuth plus the auth health endpoint;
# `--runtime` additionally makes one explicitly read-only PostgreSQL query for
# an already-created ordinary probe user.

set -euo pipefail
# Do not let a caller's `bash -x` print credentials while this script is
# reading them or writing the temporary FusionAuth header file.
set +x
umask 077

usage() {
  cat <<'USAGE'
Usage: tooling/scripts/preflight-conation-support-accounts.sh [--static|--online|--runtime]

Modes:
  --static   Validate the checked-in Conation support manifest and avatars only.
  --online   (default) Also make read-only FusionAuth and auth-health requests.
  --runtime  Also make a read-only PostgreSQL probe for one ordinary user that
             has already completed signup. This mode includes --online.

Required for --online and --runtime:
  FUSIONAUTH_URL
  FUSIONAUTH_API_KEY
  FUSIONAUTH_APPLICATION_ID
  CONATION_SUPPORT_AVATAR_BASE_URL
  CONATION_AUTH_HEALTH_URL

Additional required values for --runtime:
  CONATION_SUPPORT_PREFLIGHT_PG_SERVICE
  CONATION_SUPPORT_PREFLIGHT_PROBE_EMAIL

The database connection is selected through libpq's PGSERVICE mechanism; this
script never accepts a database URL or passes a database credential in argv.
USAGE
}

mode="online"
case "${1:-}" in
  "") ;;
  --static) mode="static" ;;
  --online) mode="online" ;;
  --runtime) mode="runtime" ;;
  --help|-h)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 64
    ;;
esac

repo_root="$(\cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
manifest="${CONATION_SUPPORT_USERS_MANIFEST:-${repo_root}/infra/stacks/fusionauth-instance/support-users.json}"

failures=0
declare -a temporary_files=()

cleanup() {
  local temporary_file
  for temporary_file in "${temporary_files[@]}"; do
    rm -f -- "$temporary_file"
  done
}
trap cleanup EXIT HUP INT TERM

pass() {
  printf 'PASS: %s\n' "$1"
}

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  failures=$((failures + 1))
}

finish() {
  local scope="$1"
  if [[ "$failures" -gt 0 ]]; then
    printf 'RESULT: %s SUPPORT PREFLIGHT FAILED (%s check(s))\n' "$scope" "$failures" >&2
    exit 1
  fi
  printf 'RESULT: %s SUPPORT PREFLIGHT PASS\n' "$scope"
}

require_command() {
  local dependency="$1"
  command -v "$dependency" >/dev/null || {
    printf "Error: required command '%s' is unavailable\n" "$dependency" >&2
    exit 1
  }
}

require_http_origin() {
  local name="$1"
  local value="$2"
  case "$value" in
    http://*|https://*) ;;
    *)
      printf 'Error: %s must be an absolute HTTP(S) origin\n' "$name" >&2
      exit 1
      ;;
  esac

  local authority="${value#*://}"
  authority="${authority%/}"
  case "$authority" in
    ""|*@*|*\?*|*\#*|*[[:space:]]*|*/*)
      printf 'Error: %s must contain only a scheme, host, and optional port\n' "$name" >&2
      exit 1
      ;;
  esac
}

require_http_url() {
  local name="$1"
  local value="$2"
  case "$value" in
    http://*|https://*) ;;
    *)
      printf 'Error: %s must be an absolute HTTP(S) URL\n' "$name" >&2
      exit 1
      ;;
  esac

  local authority="${value#*://}"
  case "$authority" in
    ""|*@*|*\?*|*\#*|*[[:space:]]*)
      printf 'Error: %s must not contain userinfo, a query, a fragment, or whitespace\n' "$name" >&2
      exit 1
      ;;
  esac
}

require_command jq

if [[ ! -f "$manifest" ]]; then
  printf 'Error: support-user manifest not found: %s\n' "$manifest" >&2
  exit 1
fi

if ! jq -e '
  type == "array" and length == 3 and
  ([.[] | .email] == [
    "pythia@conation.dev",
    "tars@conation.dev",
    "ramzan.kadyrov@conation.dev"
  ]) and
  (.[0].fusionAuthId == "70000000-0000-4000-8000-000000000001") and
  (.[0].username == "pythia") and
  (.[0].firstName == "Пифия") and
  (.[0].lastName == null) and
  (.[0].fullName == "Пифия") and
  (.[0].role == "Служба поддержки") and
  (.[0].avatarPath == "/support-avatars/pythia.svg") and
  (.[1].fusionAuthId == "70000000-0000-4000-8000-000000000002") and
  (.[1].username == "tars") and
  (.[1].firstName == "Тарс") and
  (.[1].lastName == null) and
  (.[1].fullName == "Тарс") and
  (.[1].role == "Технический директор") and
  (.[1].avatarPath == "/support-avatars/tars.svg") and
  (.[2].fusionAuthId == "70000000-0000-4000-8000-000000000003") and
  (.[2].username == "ramzan.kadyrov") and
  (.[2].firstName == "Рамзан") and
  (.[2].lastName == "Кадыров") and
  (.[2].fullName == "Рамзан Кадыров") and
  (.[2].role == "Генеральный директор") and
  (.[2].avatarPath == "/support-avatars/ramzan-kadyrov.svg") and
  all(.[];
    (.fusionAuthId | type == "string" and test("^[0-9a-f-]{36}$")) and
    (.email | type == "string" and endswith("@conation.dev")) and
    (.avatarPath | type == "string" and test("^/support-avatars/[a-z0-9-]+\\.svg$"))
  )
' "$manifest" >/dev/null; then
  fail "support-user manifest does not match the fixed Conation identity contract"
else
  pass "support-user manifest matches the three fixed Conation identities"
fi

while IFS= read -r profile; do
  email="$(jq -er '.email' <<<"$profile")"
  avatar_path="$(jq -er '.avatarPath' <<<"$profile")"
  avatar_file="${repo_root}/apps/web/public${avatar_path}"
  if [[ -f "$avatar_file" ]]; then
    pass "repository avatar exists for $email"
  else
    fail "repository avatar is missing for $email: $avatar_file"
  fi
done < <(jq -c '.[]' "$manifest")

if [[ "$failures" -gt 0 ]]; then
  finish "STATIC"
fi

if [[ "$mode" == "static" ]]; then
  printf 'NOT VERIFIED: FusionAuth accounts, webhook, database profiles, and channel memberships require --online or --runtime.\n'
  finish "STATIC"
  exit 0
fi

require_command curl
require_command mktemp

fusionauth_url="${FUSIONAUTH_URL:?set FUSIONAUTH_URL to the operator-reachable FusionAuth origin}"
fusionauth_api_key="${FUSIONAUTH_API_KEY:?set FUSIONAUTH_API_KEY without printing it}"
application_id="${FUSIONAUTH_APPLICATION_ID:?set FUSIONAUTH_APPLICATION_ID to the Conation application UUID}"
avatar_base_url="${CONATION_SUPPORT_AVATAR_BASE_URL:?set CONATION_SUPPORT_AVATAR_BASE_URL to the public Conation web URL}"
auth_health_url="${CONATION_AUTH_HEALTH_URL:?set CONATION_AUTH_HEALTH_URL to authentication-service health URL}"
webhook_key="${CONATION_SUPPORT_PREFLIGHT_WEBHOOK_KEY:-}"
unset CONATION_SUPPORT_PREFLIGHT_WEBHOOK_KEY

require_http_origin "FUSIONAUTH_URL" "$fusionauth_url"
require_http_url "CONATION_SUPPORT_AVATAR_BASE_URL" "$avatar_base_url"
require_http_url "CONATION_AUTH_HEALTH_URL" "$auth_health_url"
fusionauth_url="${fusionauth_url%/}"
avatar_base_url="${avatar_base_url%/}"

fusionauth_header_file="$(mktemp)"
temporary_files+=("$fusionauth_header_file")
printf 'Authorization: %s\n' "$fusionauth_api_key" >"$fusionauth_header_file"
unset FUSIONAUTH_API_KEY fusionauth_api_key

api_body=""
api_status=""
fusionauth_get() {
  local url="$1"
  shift
  local response_file
  response_file="$(mktemp)"
  temporary_files+=("$response_file")

  local -a curl_args=(
    --silent
    --show-error
    --max-time 10
    --output "$response_file"
    --write-out '%{http_code}'
    --request GET
    --header "@${fusionauth_header_file}"
  )
  if [[ "$#" -gt 0 ]]; then
    curl_args+=(--get "$@")
  fi

  if ! api_status="$(curl "${curl_args[@]}" "$url")"; then
    api_body="$(<"$response_file")"
    rm -f -- "$response_file"
    return 1
  fi
  api_body="$(<"$response_file")"
  rm -f -- "$response_file"
}

if curl --fail --silent --show-error --max-time 5 "$auth_health_url" >/dev/null; then
  pass "authentication-service health endpoint is reachable"
else
  fail "authentication-service health endpoint is unreachable"
fi

tenant_id=""
if ! fusionauth_get "${fusionauth_url}/api/application/${application_id}"; then
  fail "cannot read the Conation FusionAuth application"
elif [[ "$api_status" != 200 ]]; then
  fail "Conation FusionAuth application returned HTTP $api_status"
elif ! tenant_id="$(jq -er --arg application_id "$application_id" '
  select(.application.id == $application_id) | .application.tenantId
' <<<"$api_body")"; then
  fail "FusionAuth application response does not identify the requested application and tenant"
else
  pass "Conation FusionAuth application exists and identifies its tenant"
fi

if [[ -n "$tenant_id" ]]; then
  if ! fusionauth_get "${fusionauth_url}/api/tenant/${tenant_id}"; then
    fail "cannot read the FusionAuth tenant event configuration"
  elif [[ "$api_status" != 200 ]]; then
    fail "FusionAuth tenant returned HTTP $api_status"
  elif jq -e '
    .tenant.eventConfiguration.events["user.create"].enabled == true and
    .tenant.eventConfiguration.events["user.create"].transactionType == "AbsoluteMajority" and
    .tenant.eventConfiguration.events["user.create.complete"].enabled == true and
    .tenant.eventConfiguration.events["user.create.complete"].transactionType == "None"
  ' <<<"$api_body" >/dev/null; then
    pass "tenant enables transactional user.create and user.create.complete"
  else
    fail "tenant must enable user.create with AbsoluteMajority and user.create.complete with None"
  fi
fi

if [[ -n "$tenant_id" ]]; then
  if ! fusionauth_get "${fusionauth_url}/api/webhook"; then
    fail "cannot read FusionAuth webhooks"
  elif [[ "$api_status" != 200 ]]; then
    fail "FusionAuth webhooks returned HTTP $api_status"
  elif jq -e --arg tenant_id "$tenant_id" '
    [
      .webhooks[]? |
      select(
        (.url | type == "string" and test("^https?://") and endswith("/webhooks/user")) and
        (.global == true or ((.tenantIds // []) | index($tenant_id) != null)) and
        (.eventsEnabled["user.create"] == true) and
        (.eventsEnabled["user.create.complete"] == true) and
        ((.headers // {}) | to_entries | any(
          .[];
          ((.key | ascii_downcase) == "x-internal-auth-key") and
          (.value | type == "string" and length > 0)
        ))
      )
    ] | length > 0
  ' <<<"$api_body" >/dev/null; then
    pass "FusionAuth has a tenant-scoped user.create webhook with an internal-auth header"
  else
    fail "FusionAuth lacks a matching /webhooks/user webhook for user.create and user.create.complete"
  fi

  if [[ -n "$webhook_key" ]]; then
    if jq -e --arg tenant_id "$tenant_id" --arg webhook_key "$webhook_key" '
      [
        .webhooks[]? |
        select(
          (.url | type == "string" and endswith("/webhooks/user")) and
          (.global == true or ((.tenantIds // []) | index($tenant_id) != null)) and
          ((.headers // {}) | to_entries | any(
            .[];
            ((.key | ascii_downcase) == "x-internal-auth-key") and
            (.value == $webhook_key)
          ))
        )
      ] | length > 0
    ' <<<"$api_body" >/dev/null; then
      pass "FusionAuth webhook internal-auth header matches the supplied operator secret"
    else
      fail "FusionAuth webhook internal-auth header does not match the supplied operator secret"
    fi
  else
    printf 'NOT VERIFIED: exact webhook internal-auth secret; set CONATION_SUPPORT_PREFLIGHT_WEBHOOK_KEY to compare it without printing it.\n'
  fi
fi
unset webhook_key

while IFS= read -r profile; do
  email="$(jq -er '.email' <<<"$profile")"
  requested_id="$(jq -er '.fusionAuthId' <<<"$profile")"
  username="$(jq -er '.username' <<<"$profile")"
  first_name="$(jq -er '.firstName' <<<"$profile")"
  last_name="$(jq -r '.lastName // ""' <<<"$profile")"
  full_name="$(jq -er '.fullName' <<<"$profile")"
  role="$(jq -er '.role' <<<"$profile")"
  avatar_path="$(jq -er '.avatarPath' <<<"$profile")"
  avatar_url="${avatar_base_url}/${avatar_path#/}"

  if ! fusionauth_get "${fusionauth_url}/api/user" --data-urlencode "email=${email}"; then
    fail "cannot read FusionAuth support user $email"
    continue
  fi
  if [[ "$api_status" != 200 ]]; then
    fail "FusionAuth support user $email returned HTTP $api_status"
    continue
  fi
  if jq -e \
    --arg id "$requested_id" \
    --arg email "$email" \
    --arg username "$username" \
    --arg first_name "$first_name" \
    --arg last_name "$last_name" \
    --arg full_name "$full_name" \
    --arg role "$role" \
    --arg avatar_url "$avatar_url" '
      .user as $user |
      ($user.id == $id) and
      ($user.active == true) and
      ($user.email == $email) and
      ($user.username == $username) and
      ($user.firstName == $first_name) and
      (if $last_name == "" then ($user.lastName == null or $user.lastName == "") else $user.lastName == $last_name end) and
      ($user.fullName == $full_name) and
      ($user.imageUrl == $avatar_url) and
      ($user.verified == true) and
      ($user.data.conation.locale == "ru") and
      ($user.data.conation.role == $role) and
      ($user.data.conation.supportAccount == true) and
      ($user.data.conation.canReply == true)
    ' <<<"$api_body" >/dev/null; then
    pass "FusionAuth support profile matches the Conation contract for $email"
  else
    fail "FusionAuth support profile is incomplete or has unexpected identity data for $email"
  fi

  if ! fusionauth_get "${fusionauth_url}/api/user/registration/${requested_id}/${application_id}"; then
    fail "cannot read Conation registration for $email"
  elif [[ "$api_status" != 200 ]]; then
    fail "Conation registration for $email returned HTTP $api_status"
  elif jq -e --arg application_id "$application_id" '
    .registration.applicationId == $application_id
  ' <<<"$api_body" >/dev/null; then
    pass "FusionAuth registration exists for $email"
  else
    fail "FusionAuth registration response does not match the Conation application for $email"
  fi
done < <(jq -c '.[]' "$manifest")

if [[ "$mode" == "online" ]]; then
  printf 'NOT VERIFIED: database profiles, active channel memberships, and welcome delivery require --runtime against a completed ordinary-user signup.\n'
  finish "ONLINE"
  exit 0
fi

require_command psql
pg_service="${CONATION_SUPPORT_PREFLIGHT_PG_SERVICE:?set CONATION_SUPPORT_PREFLIGHT_PG_SERVICE to a read-only libpq service name}"
probe_email="${CONATION_SUPPORT_PREFLIGHT_PROBE_EMAIL:?set CONATION_SUPPORT_PREFLIGHT_PROBE_EMAIL to an ordinary user that completed signup}"
case "$probe_email" in
  *@*.*) ;;
  *)
    printf 'Error: CONATION_SUPPORT_PREFLIGHT_PROBE_EMAIL must be an email address\n' >&2
    exit 1
    ;;
esac

if ! runtime_json="$(
  PGSERVICE="$pg_service" \
  PGOPTIONS='-c default_transaction_read_only=on' \
  psql \
    --no-psqlrc \
    --no-password \
    --quiet \
    --tuples-only \
    --no-align \
    --set=ON_ERROR_STOP=1 \
    --set=probe_email="$probe_email" <<'SQL'
BEGIN READ ONLY;
WITH expected_support(email, user_id) AS (
  VALUES
    ('pythia@conation.dev', 'conation|pythia@conation.dev'),
    ('tars@conation.dev', 'conation|tars@conation.dev'),
    ('ramzan.kadyrov@conation.dev', 'conation|ramzan.kadyrov@conation.dev')
),
probe AS (
  SELECT "id" AS user_id
  FROM "User"
  WHERE lower("email") = lower(:'probe_email')
  LIMIT 1
),
required_participants AS (
  SELECT user_id FROM expected_support
  UNION ALL
  SELECT user_id FROM probe
),
candidate_channels AS (
  SELECT c.id
  FROM comms_channels AS c
  JOIN probe AS p ON p.user_id = c.owner_id
  WHERE c.channel_type = 'private'
    AND c.name = 'Поддержка Conation — ' || split_part(lower(:'probe_email'), '@', 1)
),
valid_channels AS (
  SELECT c.id
  FROM candidate_channels AS c
  WHERE NOT EXISTS (
    SELECT 1
    FROM required_participants AS required
    WHERE NOT EXISTS (
      SELECT 1
      FROM comms_channel_participants AS participant
      WHERE participant.channel_id = c.id
        AND participant.user_id = required.user_id
        AND participant.left_at IS NULL
    )
  )
)
SELECT json_build_object(
  'probeProfile', EXISTS(SELECT 1 FROM probe),
  'supportProfiles', (
    SELECT bool_and(EXISTS(
      SELECT 1
      FROM "User" AS u
      WHERE u."id" = expected_support.user_id
        AND lower(u."email") = expected_support.email
    ))
    FROM expected_support
  ),
  'supportChannel', EXISTS(SELECT 1 FROM valid_channels),
  'pythiaWelcome', EXISTS(
    SELECT 1
    FROM valid_channels AS c
    JOIN comms_messages AS message ON message.channel_id = c.id
    WHERE message.sender_id = 'conation|pythia@conation.dev'
      AND message.deleted_at IS NULL
      AND message.content LIKE '%Добро пожаловать в Conation%'
  )
);
COMMIT;
SQL
)"; then
  fail "read-only PostgreSQL runtime probe failed"
elif ! jq -e '
  .probeProfile == true and
  .supportProfiles == true and
  .supportChannel == true and
  .pythiaWelcome == true
' <<<"$runtime_json" >/dev/null; then
  fail "runtime probe did not find the expected Conation profiles, active support membership, and Pythia welcome"
else
  pass "read-only runtime probe found support profiles, active channel membership, and Pythia welcome"
fi

printf 'NOT VERIFIED: a successful membership probe does not authenticate a support account or prove that it can send a reply through every deployment ingress.\n'
finish "RUNTIME"
