#!/usr/bin/env bash

# Reconcile the Conation support mailboxes in an initialized Stalwart v0.16
# server. This is an explicit operator action: it never runs during Compose
# startup, deletes accounts, or changes an existing account's credentials.

set -euo pipefail
# Credentials are environment-driven; refuse to inherit caller-side xtrace.
set +x
umask 077

repo_root="$(\cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
manifest="${CONATION_STALWART_MAILBOX_MANIFEST:-${repo_root}/infra/selfhost/stalwart/support-mailboxes.json}"
stalwart_url="${STALWART_URL:?set STALWART_URL to the operator-reachable Stalwart management origin}"
cli_override="${CONATION_STALWART_CLI:-}"
cli_image="ghcr.io/stalwartlabs/cli:1.0.10@sha256:8d8357e347094d1ee9e2bd3dbdf4f0b4fca6786c5207dc112db29b7456aa5586"

for dependency in jq mktemp; do
  command -v "$dependency" >/dev/null || {
    echo "Error: required command '$dependency' is unavailable" >&2
    exit 1
  }
done

case "$stalwart_url" in
  http://*|https://*) ;;
  *)
    echo "Error: STALWART_URL must be an absolute HTTP(S) origin" >&2
    exit 1
    ;;
esac

# The administrator credential is sent to this origin. Refuse URL features
# that can obscure the actual authority or route the CLI to an unexpected
# endpoint. A single trailing slash is normalized for operator convenience.
stalwart_authority="${stalwart_url#*://}"
if [[ "$stalwart_authority" == */ ]]; then
  stalwart_authority="${stalwart_authority%/}"
  stalwart_url="${stalwart_url%/}"
fi
case "$stalwart_authority" in
  ""|*@*|*\?*|*\#*|*[[:space:]]*|*/*)
    echo "Error: STALWART_URL must contain only a scheme, host, and optional port" >&2
    exit 1
    ;;
esac

if [[ -n "${STALWART_TOKEN:-}" ]]; then
  if [[ -n "${STALWART_USER:-}" || -n "${STALWART_PASSWORD:-}" ]]; then
    echo "Error: set either STALWART_TOKEN or STALWART_USER/STALWART_PASSWORD, not both" >&2
    exit 1
  fi
  auth_mode="token"
else
  : "${STALWART_USER:?set STALWART_USER when STALWART_TOKEN is not set}"
  : "${STALWART_PASSWORD:?set STALWART_PASSWORD without printing it}"
  auth_mode="password"
fi

if [[ -n "$cli_override" && ! -x "$cli_override" ]]; then
  echo "Error: CONATION_STALWART_CLI must name one executable file" >&2
  exit 1
fi

if [[ -z "$cli_override" ]]; then
  command -v docker >/dev/null || {
    echo "Error: docker is required to run the pinned Stalwart CLI image" >&2
    exit 1
  }
fi

if [[ ! -f "$manifest" ]]; then
  echo "Error: mailbox manifest not found: $manifest" >&2
  exit 1
fi

jq -e '
  .domain.name == "conation.dev" and
  .domain.isEnabled == true and
  (.domain.description | type == "string" and length > 0) and
  (.accounts | type == "array" and length == 3) and
  ([.accounts[].email] == [
    "pythia@conation.dev",
    "tars@conation.dev",
    "ramzan.kadyrov@conation.dev"
  ]) and
  all(.accounts[];
    (.localPart | type == "string" and length > 0) and
    (.displayName | type == "string" and length > 0) and
    (.productRole | type == "string" and length > 0) and
    (.description | type == "string" and length > 0) and
    .locale == "ru-RU" and
    (.passwordEnv | test("^CONATION_STALWART_[A-Z0-9_]+_PASSWORD$"))
  )
' "$manifest" >/dev/null || {
  echo "Error: support mailbox manifest does not match the fixed Conation account contract" >&2
  exit 1
}

declare -a cli_docker_args=(run --rm -i -e STALWART_URL)
if [[ "$auth_mode" == "token" ]]; then
  cli_docker_args+=(-e STALWART_TOKEN)
else
  cli_docker_args+=(-e STALWART_USER -e STALWART_PASSWORD)
fi
if [[ -n "${STALWART_CLI_DOCKER_NETWORK:-}" ]]; then
  cli_docker_args+=(--network "$STALWART_CLI_DOCKER_NETWORK")
else
  cli_docker_args+=(--add-host host.docker.internal:host-gateway)
fi

run_cli() {
  if [[ -n "$cli_override" ]]; then
    "$cli_override" "$@" --no-color
  else
    docker "${cli_docker_args[@]}" "$cli_image" "$@" --no-color
  fi
}

query_error="$(mktemp)"
secret_error="$(mktemp)"
cleanup() {
  rm -f -- "$query_error" "$secret_error"
}
trap cleanup EXIT HUP INT TERM

query_json() {
  local output
  : >"$query_error"
  if ! output="$(run_cli "$@" 2>"$query_error")"; then
    if grep -qi 'bootstrap mode' "$query_error"; then
      echo "Error: Stalwart is still in bootstrap mode; complete the v0.16 setup before provisioning mailboxes" >&2
    else
      echo "Error: Stalwart management query failed" >&2
      sed -n '1,20p' "$query_error" >&2
    fi
    return 1
  fi
  if ! jq -e 'type == "array"' <<<"$output" >/dev/null; then
    echo "Error: Stalwart CLI returned an unexpected non-array query response" >&2
    return 1
  fi
  printf '%s\n' "$output"
}

domain_name="$(jq -er '.domain.name' "$manifest")"
domain_json="$(query_json query Domain --where "name=${domain_name}" --fields id,name,isEnabled --json)"
domain_matches="$(jq -c --arg name "$domain_name" '[.[] | select(.name == $name)]' <<<"$domain_json")"
domain_count="$(jq -r 'length' <<<"$domain_matches")"

if [[ "$domain_count" -gt 1 ]]; then
  echo "Error: Stalwart returned multiple exact domains named $domain_name" >&2
  exit 1
fi

domain_id=""
create_domain=false
if [[ "$domain_count" -eq 1 ]]; then
  domain_id="$(jq -er '.[0].id' <<<"$domain_matches")"
  if [[ "$(jq -r '.[0].isEnabled // true' <<<"$domain_matches")" != "true" ]]; then
    echo "Error: existing Stalwart domain $domain_name is disabled; refusing to change it automatically" >&2
    exit 1
  fi
else
  create_domain=true
fi

declare -a account_rows=()
declare -a account_ids=()
declare -a account_exists=()

while IFS= read -r account; do
  account_rows+=("$account")
  local_part="$(jq -er '.localPart' <<<"$account")"

  if [[ "$create_domain" == true ]]; then
    account_ids+=("")
    account_exists+=("false")
    continue
  fi

  accounts_json="$(query_json query Account \
    --where "name=${local_part}" \
    --where "domainId=${domain_id}" \
    --fields id,@type,name,domainId,emailAddress \
    --json)"
  matches="$(jq -c --arg name "$local_part" --arg domain_id "$domain_id" '
    [.[] | select(.name == $name and .domainId == $domain_id)]
  ' <<<"$accounts_json")"
  count="$(jq -r 'length' <<<"$matches")"
  if [[ "$count" -gt 1 ]]; then
    echo "Error: Stalwart returned multiple exact accounts for ${local_part}@${domain_name}" >&2
    exit 1
  fi
  if [[ "$count" -eq 1 ]]; then
    account_type="$(jq -r '.[0]["@type"] // "User"' <<<"$matches")"
    if [[ "$account_type" != "User" ]]; then
      echo "Error: ${local_part}@${domain_name} exists but is not a Stalwart User account" >&2
      exit 1
    fi
    account_ids+=("$(jq -er '.[0].id' <<<"$matches")")
    account_exists+=("true")
  else
    account_ids+=("")
    account_exists+=("false")
  fi
done < <(jq -c '.accounts[]' "$manifest")

# Validate every secret needed by the plan before the first mutation. Existing
# account passwords are deliberately not required because this action never
# rotates or replaces credentials.
for index in "${!account_rows[@]}"; do
  if [[ "${account_exists[$index]}" == "true" ]]; then
    continue
  fi
  password_env="$(jq -er '.passwordEnv' <<<"${account_rows[$index]}")"
  if [[ -z "${!password_env:-}" ]]; then
    email="$(jq -er '.email' <<<"${account_rows[$index]}")"
    echo "Error: $password_env is required to create $email" >&2
    exit 1
  fi
done

if [[ "$create_domain" == true ]]; then
  if ! jq -c '.domain' "$manifest" | run_cli create Domain --stdin >/dev/null; then
    echo "Error: unable to create Stalwart domain $domain_name" >&2
    exit 1
  fi
  domain_json="$(query_json query Domain --where "name=${domain_name}" --fields id,name,isEnabled --json)"
  domain_matches="$(jq -c --arg name "$domain_name" '[.[] | select(.name == $name)]' <<<"$domain_json")"
  if [[ "$(jq -r 'length' <<<"$domain_matches")" -ne 1 ]]; then
    echo "Error: Stalwart did not return exactly one $domain_name domain after creation" >&2
    exit 1
  fi
  domain_id="$(jq -er '.[0].id' <<<"$domain_matches")"
  echo "Created Stalwart domain: $domain_name"
else
  echo "Stalwart domain already exists: $domain_name"
fi

created_count=0
for index in "${!account_rows[@]}"; do
  account="${account_rows[$index]}"
  email="$(jq -er '.email' <<<"$account")"
  local_part="$(jq -er '.localPart' <<<"$account")"
  description="$(jq -er '.description' <<<"$account")"
  locale="$(jq -er '.locale' <<<"$account")"

  if [[ "${account_exists[$index]}" == "true" ]]; then
    export CONATION_ACCOUNT_DESCRIPTION="$description"
    export CONATION_ACCOUNT_LOCALE="$locale"
    if ! jq -n '{
      description: env.CONATION_ACCOUNT_DESCRIPTION,
      locale: env.CONATION_ACCOUNT_LOCALE,
      roles: {"@type": "User"}
    }' | run_cli update Account "${account_ids[$index]}" --stdin >/dev/null; then
      unset CONATION_ACCOUNT_DESCRIPTION CONATION_ACCOUNT_LOCALE
      echo "Error: unable to reconcile non-secret Stalwart profile for $email" >&2
      exit 1
    fi
    unset CONATION_ACCOUNT_DESCRIPTION CONATION_ACCOUNT_LOCALE
    echo "Reconciled existing Stalwart mailbox profile: $email"
    continue
  fi

  password_env="$(jq -er '.passwordEnv' <<<"$account")"
  export CONATION_ACCOUNT_LOCAL_PART="$local_part"
  export CONATION_ACCOUNT_DOMAIN_ID="$domain_id"
  export CONATION_ACCOUNT_DESCRIPTION="$description"
  export CONATION_ACCOUNT_LOCALE="$locale"
  export CONATION_ACCOUNT_PASSWORD="${!password_env}"
  : >"$secret_error"
  if ! jq -n '{
    name: env.CONATION_ACCOUNT_LOCAL_PART,
    domainId: env.CONATION_ACCOUNT_DOMAIN_ID,
    description: env.CONATION_ACCOUNT_DESCRIPTION,
    locale: env.CONATION_ACCOUNT_LOCALE,
    credentials: {"0": {"@type": "Password", secret: env.CONATION_ACCOUNT_PASSWORD}},
    memberGroupIds: {},
    roles: {"@type": "User"},
    permissions: {"@type": "Inherit"},
    quotas: {},
    aliases: {},
    encryptionAtRest: {"@type": "Disabled"}
  }' | run_cli create Account/User --stdin >/dev/null 2>"$secret_error"; then
    unset CONATION_ACCOUNT_LOCAL_PART CONATION_ACCOUNT_DOMAIN_ID
    unset CONATION_ACCOUNT_DESCRIPTION CONATION_ACCOUNT_LOCALE CONATION_ACCOUNT_PASSWORD
    echo "Error: unable to create Stalwart mailbox $email; CLI diagnostics were withheld because the request contained a credential" >&2
    exit 1
  fi
  unset CONATION_ACCOUNT_LOCAL_PART CONATION_ACCOUNT_DOMAIN_ID
  unset CONATION_ACCOUNT_DESCRIPTION CONATION_ACCOUNT_LOCALE CONATION_ACCOUNT_PASSWORD
  created_count=$((created_count + 1))
  echo "Created Stalwart mailbox: $email"
done

if [[ "$created_count" -gt 0 ]]; then
  if ! printf '%s\n' '{"@type":"InvalidateCaches"}' \
    | run_cli create Action --stdin >/dev/null; then
    echo "Error: mailboxes were created, but Stalwart cache invalidation failed" >&2
    exit 1
  fi
  echo "Invalidated Stalwart caches after creating $created_count mailbox(es)."
fi

echo "Conation support mailbox reconciliation complete. Existing passwords were not changed."
