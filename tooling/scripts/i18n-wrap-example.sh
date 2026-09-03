#!/usr/bin/env bash

set -euo pipefail

printf '%s\n' \
  'This migration helper is intentionally non-mutating.' \
  'Translate only reviewed user-visible text with semantic keys.' \
  'Do not mechanically wrap quoted strings: they may be types, fixtures, paths, URLs, or protocol values.' \
  'For each bounded UI slice, edit source and both locale catalogs by hand, then run focused tests, type-check, and ICU/catalog validation.'

exit 64
