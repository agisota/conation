#!/usr/bin/env bash
set -euo pipefail

# Rebranding crosses persistent database, API, authentication, deployment, and
# third-party contracts. A repository-wide text replacement cannot distinguish
# those contracts from product-owned display copy, so mutation is deliberately
# disabled here.

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MAPPING="$ROOT/docs/REBRAND_CONATION.md"

if [[ "${1:-}" != "--check" || "$#" -ne 1 ]]; then
  cat >&2 <<EOF
Automated rebranding is disabled because it can corrupt compatibility contracts.

--reapply (conation/overlay keep-macro_* workflow) is retired. Product line
is conation/main with crate-rename members (crates/conation_*), not a textual
re-apply over crates/macro_*.

Review the migration mapping first:
  $MAPPING

For a read-only repository sanity check, run:
  $0 --check
EOF
  exit 64
fi

if [[ ! -f "$MAPPING" ]]; then
  echo "Missing rebrand mapping: $MAPPING" >&2
  exit 1
fi

echo "[rebrand] No files will be modified."
echo "[rebrand] Contract mapping: $MAPPING"
git -C "$ROOT" diff --check
echo "[rebrand] Working-tree whitespace check passed."
