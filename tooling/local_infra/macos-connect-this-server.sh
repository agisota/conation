#!/usr/bin/env bash
# Wrapper: canonical MacBook connector lives at scripts/macos-connect-local-server.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec "${ROOT}/scripts/macos-connect-local-server.sh" "$@"
