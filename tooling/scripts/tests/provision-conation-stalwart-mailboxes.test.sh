#!/usr/bin/env bash

set -euo pipefail
umask 077

repo_root="$(\cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
provisioner="${repo_root}/tooling/scripts/provision-conation-stalwart-mailboxes.sh"
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

fake_cli="${test_root}/stalwart-cli"
cat >"$fake_cli" <<'FAKE_CLI'
#!/usr/bin/env bash
set -euo pipefail
umask 077

state="${FAKE_STALWART_STATE:?}"
log="${FAKE_STALWART_LOG:?}"
mkdir -p "$state"
[[ -f "$state/accounts.json" ]] || printf '%s\n' '[]' >"$state/accounts.json"

command_name="${1:?}"
object="${2:?}"
shift 2

case "${command_name}:${object}" in
  query:Domain)
    if [[ -f "$state/domain.json" ]]; then
      jq -s '.' "$state/domain.json"
    else
      printf '%s\n' '[]'
    fi
    ;;
  create:Domain)
    payload="$(mktemp)"
    trap 'rm -f -- "$payload"' EXIT
    cat >"$payload"
    jq -e '.name == "conation.dev" and .isEnabled == true' "$payload" >/dev/null
    jq '. + {id: "domain-1"}' "$payload" >"$state/domain.json"
    printf '%s\n' 'create:domain' >>"$log"
    printf '%s\n' 'Created Domain domain-1'
    ;;
  query:Account)
    name=""
    domain_id=""
    while [[ "$#" -gt 0 ]]; do
      case "$1" in
        --where)
          case "$2" in
            name=*) name="${2#name=}" ;;
            domainId=*) domain_id="${2#domainId=}" ;;
          esac
          shift 2
          ;;
        *) shift ;;
      esac
    done
    jq --arg name "$name" --arg domain_id "$domain_id" '
      [.[] | select(.name == $name and .domainId == $domain_id)]
    ' "$state/accounts.json"
    ;;
  create:Account/User)
    payload="$(mktemp)"
    updated="$(mktemp)"
    trap 'rm -f -- "$payload" "$updated"' EXIT
    cat >"$payload"
    jq -e '
      (.credentials["0"]["@type"] == "Password") and
      (.credentials["0"].secret | type == "string" and length > 0) and
      .locale == "ru-RU" and
      .roles["@type"] == "User"
    ' "$payload" >/dev/null
    next_id="account-$(( $(jq 'length' "$state/accounts.json") + 1 ))"
    jq \
      --arg id "$next_id" \
      --slurpfile payload "$payload" \
      --slurpfile domain "$state/domain.json" '
        . + [{
          id: $id,
          "@type": "User",
          name: $payload[0].name,
          domainId: $payload[0].domainId,
          emailAddress: ($payload[0].name + "@" + $domain[0].name),
          description: $payload[0].description,
          locale: $payload[0].locale,
          roles: $payload[0].roles
        }]
      ' "$state/accounts.json" >"$updated"
    mv -- "$updated" "$state/accounts.json"
    printf 'create:account:%s\n' "$(jq -r '.name' "$payload")" >>"$log"
    printf 'Created Account %s\n' "$next_id"
    ;;
  update:Account)
    account_id="${1:?}"
    shift
    payload="$(mktemp)"
    updated="$(mktemp)"
    trap 'rm -f -- "$payload" "$updated"' EXIT
    cat >"$payload"
    jq -e '.credentials == null and .locale == "ru-RU" and .roles["@type"] == "User"' "$payload" >/dev/null
    jq --arg id "$account_id" --slurpfile patch "$payload" '
      map(if .id == $id then . + $patch[0] else . end)
    ' "$state/accounts.json" >"$updated"
    mv -- "$updated" "$state/accounts.json"
    printf 'update:account:%s\n' "$account_id" >>"$log"
    printf 'Updated Account %s\n' "$account_id"
    ;;
  create:Action)
    payload="$(mktemp)"
    trap 'rm -f -- "$payload"' EXIT
    cat >"$payload"
    jq -e '.["@type"] == "InvalidateCaches"' "$payload" >/dev/null
    printf '%s\n' 'create:action:invalidate-caches' >>"$log"
    printf '%s\n' 'Created Action action-1'
    ;;
  *)
    echo "fake CLI received unsupported call: $command_name $object" >&2
    exit 64
    ;;
esac
FAKE_CLI
chmod 700 "$fake_cli"

export CONATION_STALWART_CLI="$fake_cli"
export STALWART_URL="http://stalwart.test:8080"
export STALWART_USER="operator"
export STALWART_PASSWORD="fake-admin-secret-never-print"

first_state="${test_root}/first-state"
first_log="${test_root}/first.log"
first_output="${test_root}/first.out"
mkdir -p "$first_state"
: >"$first_log"
export FAKE_STALWART_STATE="$first_state"
export FAKE_STALWART_LOG="$first_log"
export CONATION_STALWART_PYTHIA_PASSWORD="fake-pythia-secret-never-print"
export CONATION_STALWART_TARS_PASSWORD="fake-tars-secret-never-print"
export CONATION_STALWART_RAMZAN_KADYROV_PASSWORD="fake-ramzan-secret-never-print"

# Exercise an accidentally xtrace-enabled invocation. The provisioner must
# disable xtrace before it reads or copies any credential.
bash -x "$provisioner" >"$first_output" 2>&1
assert_count 1 '^create:domain$' "$first_log"
assert_count 3 '^create:account:' "$first_log"
assert_count 1 '^create:action:invalidate-caches$' "$first_log"
jq -e '
  length == 3 and
  all(.[]; .["@type"] == "User" and .locale == "ru-RU" and .roles["@type"] == "User") and
  ([.[].emailAddress] == [
    "pythia@conation.dev",
    "tars@conation.dev",
    "ramzan.kadyrov@conation.dev"
  ])
' "$first_state/accounts.json" >/dev/null

unset CONATION_STALWART_PYTHIA_PASSWORD
unset CONATION_STALWART_TARS_PASSWORD
unset CONATION_STALWART_RAMZAN_KADYROV_PASSWORD
bash "$provisioner" >>"$first_output" 2>&1
assert_count 1 '^create:domain$' "$first_log"
assert_count 3 '^create:account:' "$first_log"
assert_count 1 '^create:action:invalidate-caches$' "$first_log"
assert_count 3 '^update:account:' "$first_log"

for secret in \
  fake-admin-secret-never-print \
  fake-pythia-secret-never-print \
  fake-tars-secret-never-print \
  fake-ramzan-secret-never-print
do
  if grep -R -F -- "$secret" "$first_output" "$first_log" "$first_state" >/dev/null; then
    fail "secret leaked to provisioner output, fake CLI log, or persisted fake state"
  fi
done

missing_state="${test_root}/missing-state"
missing_log="${test_root}/missing.log"
missing_output="${test_root}/missing.out"
mkdir -p "$missing_state"
cp "$first_state/domain.json" "$missing_state/domain.json"
printf '%s\n' '[]' >"$missing_state/accounts.json"
: >"$missing_log"
export FAKE_STALWART_STATE="$missing_state"
export FAKE_STALWART_LOG="$missing_log"
export CONATION_STALWART_PYTHIA_PASSWORD="fake-pythia-secret-never-print"
unset CONATION_STALWART_TARS_PASSWORD
export CONATION_STALWART_RAMZAN_KADYROV_PASSWORD="fake-ramzan-secret-never-print"

if bash "$provisioner" >"$missing_output" 2>&1; then
  fail "provisioning unexpectedly succeeded without the Tars mailbox password"
fi
grep -F 'CONATION_STALWART_TARS_PASSWORD is required' "$missing_output" >/dev/null \
  || fail "missing-secret failure did not name the required environment variable"
assert_count 0 '^create:account:' "$missing_log"
assert_count 0 '^update:account:' "$missing_log"

unset STALWART_PASSWORD
if bash "$provisioner" >"${test_root}/missing-admin.out" 2>&1; then
  fail "provisioning unexpectedly succeeded without an administrator credential"
fi
grep -F 'STALWART_PASSWORD' "${test_root}/missing-admin.out" >/dev/null \
  || fail "missing administrator credential did not fail closed"

export STALWART_PASSWORD="fake-admin-secret-never-print"
for invalid_url in \
  'ftp://stalwart.test:8080' \
  'http://operator@stalwart.test:8080' \
  'http://stalwart.test:8080/admin' \
  'http://stalwart.test:8080?redirect=evil.example' \
  'http://stalwart.test:8080#fragment'
do
  export STALWART_URL="$invalid_url"
  invalid_output="${test_root}/invalid-url.out"
  if bash "$provisioner" >"$invalid_output" 2>&1; then
    fail "provisioning unexpectedly accepted non-origin STALWART_URL"
  fi
  grep -F 'STALWART_URL must' "$invalid_output" >/dev/null \
    || fail "invalid STALWART_URL did not report the origin contract"
done

echo "Stalwart support mailbox provisioning harness: PASS"
