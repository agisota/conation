#!/usr/bin/env bash

set -euo pipefail

stack_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source_file="$stack_dir/index.ts"

if ! rg --fixed-strings --quiet "config.require('cloud_storage_stack_ref')" "$source_file"; then
  echo "agent harness must require cloud_storage_stack_ref" >&2
  exit 1
fi

if rg --fixed-strings --quiet 'macro-inc/document-storage' "$source_file"; then
  echo "agent harness must not retain a Macro document-storage default" >&2
  exit 1
fi

for environment in dev prod; do
  config_file="$stack_dir/Pulumi.$environment.yaml"
  reference="$(sed -n 's/^  agent-harness-service:cloud_storage_stack_ref: //p' "$config_file")"

  if [[ -z "$reference" ]]; then
    echo "$config_file must set cloud_storage_stack_ref" >&2
    exit 1
  fi

  if [[ "$reference" == *macro-inc* ]]; then
    echo "$config_file must not point at a Macro organization" >&2
    exit 1
  fi
done
