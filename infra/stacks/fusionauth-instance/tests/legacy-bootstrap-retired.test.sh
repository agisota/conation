#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
stack_dir="${repo_root}/infra/stacks/fusionauth-instance"
run_local="${repo_root}/tooling/scripts/run-local.sh"

fail() {
  echo "legacy FusionAuth bootstrap regression: $*" >&2
  exit 1
}

test ! -e "${stack_dir}/Pulumi.local.yaml" || fail "Pulumi.local.yaml must not restore a local Pulumi stack"
test ! -e "${stack_dir}/kickstart/kickstart.json" || fail "a static credential-bearing kickstart must not be tracked"
rg -Fq "if (stack === 'local')" "${stack_dir}/constants.ts" || fail "legacy local Pulumi execution must be rejected"
rg -Fq 'The local FusionAuth Pulumi program has been retired.' "${stack_dir}/constants.ts" || fail "local Pulumi rejection must explain the supported path"

for file in "${stack_dir}/justfile" "${run_local}"; do
  if rg -n -i 'macroApplicationClientId|patch_local_fusionauth_env|FUSIONAUTH_(API_KEY|CLIENT_SECRET)|JWT_SECRET_KEY' "$file" >/dev/null; then
    fail "retired bootstrap reference remains in ${file#"${repo_root}/"}"
  fi
  if rg -n '(^|[;&|[:space:]])pulumi([[:space:]]|$)' "$file" >/dev/null; then
    fail "retired bootstrap invokes Pulumi in ${file#"${repo_root}/"}"
  fi
done

rg -Fq 'just stack up' "${stack_dir}/README.md" || fail "README must name the supported stack command"
rg -Fq 'xtask' "${stack_dir}/README.md" || fail "README must explain the generated kickstart owner"
rg -Fq '/run/conation/xtask-generated-kickstart.json' "${stack_dir}/docker-compose.yml" || fail "base Compose must require xtask's kickstart override"

if rg -F './kickstart:/usr/local/fusionauth/kickstart' "${stack_dir}/docker-compose.yml" >/dev/null; then
  fail "base Compose must not mount a static kickstart directory"
fi

if "$run_local" >/dev/null 2>&1; then
  fail "retired run-local entry point must fail closed"
fi
