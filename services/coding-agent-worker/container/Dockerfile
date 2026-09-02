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
