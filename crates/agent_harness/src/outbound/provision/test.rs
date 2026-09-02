use super::{ENSURE_READY_SCRIPT, SIDECAR_PORT};
use crate::domain::model::{EGRESS_URL_VARIABLE, SESSION_TOKEN_VARIABLE};

const SANDBOX_DOCKERFILE: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/container/Dockerfile"));
const OPENCODE_CONFIG: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/container/opencode.json"
));

/// The script and the Rust constants name the same things. Asserted rather
/// than commented because the two are edited months apart, and a rename on
/// either side would otherwise show up only as a sandbox that never clones.
#[test]
fn the_script_and_the_harness_agree_on_shared_names() {
    assert!(ENSURE_READY_SCRIPT.contains(&format!("sidecar_port={SIDECAR_PORT}")));
    assert!(ENSURE_READY_SCRIPT.contains(&format!("${{{EGRESS_URL_VARIABLE}%/}}/git")));
    assert!(ENSURE_READY_SCRIPT.contains(&format!("${SESSION_TOKEN_VARIABLE}")));
}

/// The sandbox holds no GitHub credential and is told no repository: it clones
/// from the proxy, which reads both off the session's own grant.
#[test]
fn clone_uses_session_egress_without_a_github_token() {
    assert!(!ENSURE_READY_SCRIPT.contains("GITHUB_TOKEN"));
    assert!(!ENSURE_READY_SCRIPT.contains("REPO_URL"));
    assert!(!ENSURE_READY_SCRIPT.contains("gh auth"));
}

#[test]
fn image_bake_uses_an_ephemeral_buildkit_secret_for_the_private_repo() {
    assert!(
        SANDBOX_DOCKERFILE.contains("--mount=type=secret,id=github_token"),
        "private source access must use a BuildKit secret mount"
    );
    assert!(SANDBOX_DOCKERFILE.contains("GIT_ASKPASS"));
    assert!(SANDBOX_DOCKERFILE.contains("https://github.com/agisota/conation.git"));
    assert!(!SANDBOX_DOCKERFILE.contains("ARG GITHUB_TOKEN"));
    assert!(!SANDBOX_DOCKERFILE.contains("github.com/macro-inc/macro"));

    let secret_step = SANDBOX_DOCKERFILE
        .split_once("RUN --mount=type=secret,id=github_token bash <<'EOF'\n")
        .expect("Dockerfile should contain the secret-mounted clone step")
        .1
        .split_once("\nEOF\n")
        .expect("secret-mounted clone step should have a closed heredoc")
        .0;
    assert!(secret_step.contains("git -c credential.helper= clone"));
    assert!(
        !secret_step.contains("nix develop"),
        "repository code must not run while the GitHub secret is mounted"
    );
}

#[test]
fn opencode_is_pinned_to_the_rox_provider_and_known_models() {
    let config: serde_json::Value =
        serde_json::from_str(OPENCODE_CONFIG).expect("OpenCode config should be JSON");
    assert_eq!(config["enabled_providers"], serde_json::json!(["rox"]));
    assert_eq!(config["model"], "rox/gemini-2.5-flash");
    assert_eq!(
        config["provider"]["rox"]["options"]["baseURL"],
        "https://api.rox.one/v1"
    );
    assert_eq!(
        config["provider"]["rox"]["options"]["apiKey"],
        "{env:ROX_API_KEY}"
    );
    for model in ["gemini-2.5-flash", "nemotron-3-ultra", "gpt-5.6-luna"] {
        assert!(config["provider"]["rox"]["models"][model].is_object());
    }
}
