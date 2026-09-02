# syntax=docker/dockerfile:1.7

# Sidecar install
FROM rust:1.94.0-slim-bullseye AS sidecar-build
WORKDIR /build
COPY sidecar/Cargo.toml sidecar/Cargo.lock ./
COPY sidecar/src ./src
RUN cargo build --locked --release

# Conation nix devshell hard install
FROM ubuntu:22.04 AS nix-build

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl xz-utils && \
    rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://install.determinate.systems/nix | \
    sh -s -- install linux --init none --no-confirm

ENV PATH=/nix/var/nix/profiles/default/bin:$PATH
ENV NIX_CONFIG="experimental-features = nix-command flakes"

WORKDIR /env
COPY flake.nix flake.lock* ./

RUN nix develop --profile /env/.base-root path:/env --command true && \
    nix print-dev-env path:/env > /env/dev-env.sh

# Bake the Conation repo's dev shell when the private-repository token is
# available. The secret exists only for this RUN and is read by GIT_ASKPASS;
# it never appears in an ARG, URL, layer, or build output. A builder without
# secret support still emits a usable cold image.
ARG CONATION_REPO_URL=https://github.com/agisota/conation.git
RUN --mount=type=secret,id=github_token bash <<'EOF'
set -euo pipefail
source /env/dev-env.sh

case "$CONATION_REPO_URL" in
  https://github.com/*) ;;
  *) echo "CONATION_REPO_URL must be an https://github.com repository" >&2; exit 2 ;;
esac
case "$CONATION_REPO_URL" in
  *"@"*|*"?"*|*"#"*) echo "CONATION_REPO_URL must not contain credentials, query, or fragment" >&2; exit 2 ;;
esac

askpass="$(mktemp)"
cleanup() {
  rm -f "$askpass"
}
trap cleanup EXIT

if [ -s /run/secrets/github_token ]; then
  cat > "$askpass" <<'ASKPASS'
#!/bin/sh
case "$1" in
  Username*) printf '%s\n' 'x-access-token' ;;
  Password*) cat /run/secrets/github_token ;;
  *) exit 1 ;;
esac
ASKPASS
  chmod 700 "$askpass"
  export GIT_ASKPASS="$askpass"
fi
export GIT_TERMINAL_PROMPT=0

if ! git -c credential.helper= clone --depth 1 "$CONATION_REPO_URL" /tmp/bake; then
  rm -rf /tmp/bake
  if [ ! -s /run/secrets/github_token ]; then
    echo "github_token was not provided; continuing without the optional baked Conation dev shell" >&2
    exit 0
  fi
  exit 1
fi
EOF

# Evaluate the cloned flake only after the BuildKit secret mount is gone.
RUN bash <<'EOF'
set -euo pipefail
if [ ! -d /tmp/bake/.git ]; then
  exit 0
fi
trap 'rm -rf /tmp/bake' EXIT
source /env/dev-env.sh

nix develop --accept-flake-config --profile /env/.repo-root path:/tmp/bake --command true
nix print-dev-env --accept-flake-config path:/tmp/bake > /env/repo-dev-env.sh
EOF
RUN \
    nix-collect-garbage -d && \
    rm -rf /root/.cache/nix

# Runtime
FROM ubuntu:22.04

# curl: the ensure script's readiness probe. nixbld users: nix.conf names the
# group, and source builds inside the sandbox need it.
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl sudo xz-utils && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd -r nixbld && \
    for i in $(seq 1 10); do \
      useradd -r -g nixbld -G nixbld -d /var/empty -s /usr/sbin/nologin "nixbld$i"; \
    done

# Largest, least volatile layer first so sidecar/config changes reuse it.
COPY --from=nix-build /nix /nix
# The whole directory: nix.conf `!include`s nix.custom.conf.
COPY --from=nix-build /etc/nix /etc/nix
COPY --from=nix-build /env /env

ENV PATH=/nix/var/nix/profiles/default/bin:$PATH \
    BASH_ENV=/env/dev-env.sh \
    SHELL=/bin/bash

COPY --from=sidecar-build /build/target/release/acp-sidecar /opt/acp-sidecar
COPY --chmod=755 ensure.sh /opt/ensure.sh
COPY opencode.json /root/.config/opencode/opencode.json

CMD ["bash"]
