//! Shared container-image readiness recipe used by sandbox providers.

use std::time::Duration;

use agent_session::domain::model::SessionPermissionMode;

use crate::domain::model::opencode_permission_map;

/// Clone and sidecar startup timeout.
pub const ENSURE_TIMEOUT: Duration = Duration::from_secs(300);

/// Time allowed for the sidecar readiness probe.
pub const PING_TIMEOUT: Duration = Duration::from_secs(60);

/// Location of sidecar output inside the container.
pub const SIDECAR_LOG: &str = "/tmp/acp-sidecar.log";

/// Port exposed by the ACP sidecar.
pub const SIDECAR_PORT: u16 = 8700;

/// Provider-side label carrying the session a container belongs to.
///
/// Shared by every provider because it is what `resume` and `teardown` look a
/// container up by: the harness knows only the session id, and the container is
/// whatever the provider tagged with it.
pub const SESSION_LABEL: &str = "conation.agent_session_id";

/// OpenCode config path baked into the sandbox image.
pub const OPENCODE_CONFIG_PATH: &str = "/root/.config/opencode/opencode.json";

/// Readiness recipe baked alongside the harness container.
const ENSURE_READY_SCRIPT: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/container/ensure_ready.sh"
));

/// Baked OpenCode config. Spawn overlays `permission` from the session mode.
const OPENCODE_CONFIG: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/container/opencode.json"
));

#[cfg(test)]
mod test;

/// Wrap the readiness recipe as one command for provider exec APIs.
#[must_use]
pub fn ensure_ready_command() -> String {
    format!("bash -c '{}'", ENSURE_READY_SCRIPT.replace('\'', r"'\''"))
}

/// Write the session's OpenCode permission map over the baked config.
///
/// Runs before the sidecar starts so OpenCode reads the session mode.
#[must_use]
pub fn stamp_opencode_permission_command(mode: SessionPermissionMode) -> String {
    let mut config: serde_json::Value =
        serde_json::from_str(OPENCODE_CONFIG).expect("baked OpenCode config is JSON");
    config["permission"] = opencode_permission_map(mode);
    let json = serde_json::to_string_pretty(&config).expect("permission overlay is JSON");
    format!("cat > {OPENCODE_CONFIG_PATH} <<'EOF'\n{json}\nEOF")
}

/// Read the egress session token back out of a running container.
///
/// The container was handed the raw token in its environment at spawn and the
/// harness keeps only the hash, so on reattach this is where the token comes
/// from.
#[must_use]
pub fn session_token_command() -> String {
    format!("printenv {}", crate::domain::model::SESSION_TOKEN_VARIABLE)
}

/// The token as [`session_token_command`]'s output carries it.
///
/// `None` for empty output: a container with no token in its environment
/// answers a blank line, and a blank Authorization header is worse than none.
#[must_use]
pub fn parse_session_token(output: &str) -> Option<String> {
    let token = output.trim();
    (!token.is_empty()).then(|| token.to_owned())
}
