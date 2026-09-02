#!/usr/bin/env bash

# Reconcile the three Conation support identities in FusionAuth. The script is
# reads its API key from the environment, then passes it to curl through a
# private temporary header file rather than curl's argv. It is safe to run
# repeatedly: existing users are patched and registrations are created only
# when missing.

set -euo pipefail
umask 077

repo_root="$(\cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
manifest="${CONATION_SUPPORT_USERS_MANIFEST:-${repo_root}/infra/stacks/fusionauth-instance/support-users.json}"
fusionauth_url="${FUSIONAUTH_URL:?set FUSIONAUTH_URL to the operator-reachable FusionAuth origin}"
fusionauth_api_key="${FUSIONAUTH_API_KEY:?set FUSIONAUTH_API_KEY without printing it}"
application_id="${FUSIONAUTH_APPLICATION_ID:?set FUSIONAUTH_APPLICATION_ID to the Conation application UUID}"
avatar_base_url="${CONATION_SUPPORT_AVATAR_BASE_URL:?set CONATION_SUPPORT_AVATAR_BASE_URL to the public Conation web origin}"
auth_health_url="${CONATION_AUTH_HEALTH_URL:-}"

for dependency in curl jq openssl; do
  command -v "$dependency" >/dev/null || {
    echo "Error: required command '$dependency' is unavailable" >&2
    exit 1
  }
done

jq -e '
  type == "array" and length == 3 and
  all(.[];
    (.fusionAuthId | type == "string") and
    (.email | type == "string" and endswith("@conation.dev")) and
    (.username | type == "string" and length > 0) and
    (.firstName | type == "string" and length > 0) and
    (.fullName | type == "string" and length > 0) and
    (.role | type == "string" and length > 0) and
    (.avatarPath | type == "string" and startswith("/support-avatars/"))
  )
' "$manifest" >/dev/null

if [[ -n "$auth_health_url" ]]; then
  ready=false
  for _attempt in $(seq 1 60); do
    if curl --fail --silent --show-error --max-time 3 "$auth_health_url" >/dev/null 2>&1; then
      ready=true
      break
    fi
    sleep 2
  done
  if [[ "$ready" != true ]]; then
    echo "Error: authentication service did not become healthy at $auth_health_url" >&2
    exit 1
  fi
fi

api_body=""
api_status=""
declare -a temporary_files=()

cleanup() {
  local temporary_file
  for temporary_file in "${temporary_files[@]}"; do
    rm -f -- "$temporary_file"
  done
}
trap cleanup EXIT HUP INT TERM

fusionauth_header_file="$(mktemp)"
temporary_files+=("$fusionauth_header_file")
printf 'Authorization: %s\n' "$fusionauth_api_key" >"$fusionauth_header_file"
unset FUSIONAUTH_API_KEY fusionauth_api_key

fusionauth_request() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local response_file
  response_file="$(mktemp)"
  temporary_files+=("$response_file")

  if [[ -n "$body" ]]; then
    api_status="$(curl --silent --show-error \
      --output "$response_file" \
      --write-out '%{http_code}' \
      --request "$method" \
      --header "@${fusionauth_header_file}" \
      --header 'Content-Type: application/json' \
      --data "$body" \
      "$url")"
  else
    api_status="$(curl --silent --show-error \
      --output "$response_file" \
      --write-out '%{http_code}' \
      --request "$method" \
      --header "@${fusionauth_header_file}" \
      "$url")"
  fi

  api_body="$(<"$response_file")"
  rm -f -- "$response_file"
}

while IFS= read -r profile; do
  email="$(jq -r '.email' <<<"$profile")"
  requested_id="$(jq -r '.fusionAuthId' <<<"$profile")"
  avatar_path="$(jq -r '.avatarPath' <<<"$profile")"
  avatar_url="${avatar_base_url%/}/${avatar_path#/}"

  user_json="$(jq -n \
    --argjson profile "$profile" \
    --arg image_url "$avatar_url" '
      {
        active: true,
        email: $profile.email,
        username: $profile.username,
        firstName: $profile.firstName,
        fullName: $profile.fullName,
        imageUrl: $image_url,
        verified: true,
        data: {
          conation: {
            locale: "ru",
            role: $profile.role,
            supportAccount: true,
            canReply: true
          }
        }
      }
      + (if $profile.lastName == null then {} else {lastName: $profile.lastName} end)
    ')"

  lookup_file="$(mktemp)"
  temporary_files+=("$lookup_file")
  lookup_status="$(curl --silent --show-error \
    --output "$lookup_file" \
    --write-out '%{http_code}' \
    --get \
    --header "@${fusionauth_header_file}" \
    --data-urlencode "email=${email}" \
    "${fusionauth_url%/}/api/user")"
  lookup_body="$(<"$lookup_file")"
  rm -f -- "$lookup_file"

  case "$lookup_status" in
    200)
      user_id="$(jq -er '.user.id' <<<"$lookup_body")"
      if [[ "$user_id" != "$requested_id" ]]; then
        echo "Error: FusionAuth user for $email has ID $user_id, but the Conation manifest requires $requested_id; refusing to mutate the existing account" >&2
        exit 1
      fi
      update_payload="$(jq -n --argjson user "$user_json" '{user: $user}')"
      fusionauth_request PATCH "${fusionauth_url%/}/api/user/${user_id}" "$update_payload"
      if [[ "$api_status" != 200 ]]; then
        echo "Error: unable to update support user $email (FusionAuth HTTP $api_status)" >&2
        exit 1
      fi
      ;;
    404)
      user_id="$requested_id"
      password="$(openssl rand -base64 36 | tr -d '\n')"
      create_payload="$(jq -n \
        --arg application_id "$application_id" \
        --arg password "$password" \
        --argjson user "$user_json" \
        '{applicationId: $application_id, skipVerification: true, user: ($user + {password: $password})}')"
      unset password
      fusionauth_request POST "${fusionauth_url%/}/api/user/${user_id}" "$create_payload"
      if [[ "$api_status" != 200 ]]; then
        echo "Error: unable to create support user $email (FusionAuth HTTP $api_status)" >&2
        exit 1
      fi
      ;;
    *)
      echo "Error: unable to look up support user $email (FusionAuth HTTP $lookup_status)" >&2
      exit 1
      ;;
  esac

  registration_payload="$(jq -n --arg application_id "$application_id" '{registration: {applicationId: $application_id}}')"
  fusionauth_request POST "${fusionauth_url%/}/api/user/registration/${user_id}" "$registration_payload"
  if [[ "$api_status" != 200 ]] && ! {
    [[ "$api_status" == 400 ]] && grep -q '\[duplicate\]registration' <<<"$api_body"
  }; then
    echo "Error: unable to register support user $email (FusionAuth HTTP $api_status)" >&2
    exit 1
  fi

  echo "Provisioned Conation support profile: $email"
done < <(jq -c '.[]' "$manifest")
