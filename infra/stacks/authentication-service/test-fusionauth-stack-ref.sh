#!/usr/bin/env bash

set -euo pipefail

stack_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source_file="$stack_dir/index.ts"

if ! rg --fixed-strings --quiet "config.require('fusionauth_stack_ref')" "$source_file"; then
  echo "authentication service must require fusionauth_stack_ref" >&2
  exit 1
fi

if rg --fixed-strings --quiet 'macro-inc/fusion-auth' "$source_file"; then
  echo "authentication service must not retain a Macro FusionAuth default" >&2
  exit 1
fi

for environment in dev prod; do
  config_file="$stack_dir/Pulumi.$environment.yaml"
  reference="$(sed -n 's/^  authentication-service:fusionauth_stack_ref: //p' "$config_file")"

  if [[ -z "$reference" ]]; then
    echo "$config_file must set fusionauth_stack_ref" >&2
    exit 1
  fi

  if [[ "$reference" == *macro-inc* ]]; then
    echo "$config_file must not point at a Macro organization" >&2
    exit 1
  fi
done
