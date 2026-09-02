#!/usr/bin/env bash
# Bring the sandbox to "ready" no matter its current state. Every stage skips
# itself when already done, so this is safe to run on first boot, reconnect,
# or after a machine restart. Only the egress capability comes from the
# sandbox environment; the repository and GitHub authentication remain server-side.
set -eo pipefail

: "${CONATION_EGRESS_URL:?CONATION_EGRESS_URL is required}"
: "${CONATION_SESSION_TOKEN:?CONATION_SESSION_TOKEN is required}"
egress_git_url="${CONATION_EGRESS_URL%/}/git"
git_credential_helper="!f() { printf \"username=x-access-token\\npassword=%s\\n\" \"\$CONATION_SESSION_TOKEN\"; }; f"

if [ ! -d /workspace/.git ]; then
  git -c credential.helper= \
    -c "credential.$egress_git_url.helper=$git_credential_helper" \
    clone --depth 1 "$egress_git_url" /workspace
fi

# Start the sidecar with the baked repo dev shell first on PATH and the base
# tools (opencode and git) still reachable.
if ! curl -sf localhost:8700/ping >/dev/null 2>&1; then
  baked_path="$PATH"
  if [ -f /env/repo-dev-env.sh ]; then
    # shellcheck disable=SC1091
    source /env/repo-dev-env.sh
    export PATH="$PATH:$baked_path"
  fi
  nohup /opt/acp-sidecar >/tmp/acp-sidecar.log 2>&1 &
fi
