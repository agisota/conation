//! Ensure the local agent-harness sandbox image exists before compose starts
//! the harness.
//!
//! When local sandboxes are on, `run_local` / `stack up` always `docker build`
//! the tag with no `--platform`, so the daemon's native arch wins. The sandbox
//! flake exposes `x86_64-linux` and `aarch64-linux`; Apple Silicon and ARM
//! Linux therefore bake natively instead of qemu. BuildKit cache is the
//! freshness check: unchanged `container/` is a no-op rebuild, a Dockerfile or
//! flake change pays the two nix shells. `--no-build` (CI snapshot bake)
//! skips that: the image is already on the daemon from preload.

use std::collections::BTreeMap;
use std::path::Path;
use std::process::Command;

use anyhow::{Result, bail};

use super::stage::Stage;

#[cfg(test)]
mod test;

/// Local Docker tag `just run_local` loads.
pub const DEFAULT_LOCAL_TAG: &str = "conation-agent-harness:latest";

/// Private source repository whose dev shell the image warms when authorized.
pub const DEFAULT_REPO_URL: &str = "https://github.com/agisota/conation.git";

/// Process-only variable used to hand a resolved token to BuildKit.
const BUILDKIT_GITHUB_TOKEN_ENV: &str = "CONATION_SANDBOX_GITHUB_TOKEN";

/// Build context matching `just -f crates/agent_harness/justfile build-local`.
pub const CONTEXT_REL: &str = "crates/agent_harness/container";

/// What [`ensure`] will do for a resolved env, before talking to Docker.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct EnsurePlan {
    /// Tag the harness is configured to run.
    pub tag: String,
}

impl EnsurePlan {
    /// `None` when local containers are off, so stack-up skips this entirely.
    pub fn from_env(env: &BTreeMap<String, String>) -> Option<Self> {
        if env
            .get("DEV_DANGEROUS_LOCAL_CONTAINERS")
            .map(String::as_str)
            != Some("true")
        {
            return None;
        }
        let tag = env
            .get("LOCAL_CONTAINER_IMAGE")
            .map(String::as_str)
            .filter(|s| !s.is_empty())
            .unwrap_or(DEFAULT_LOCAL_TAG)
            .to_owned();
        Some(Self { tag })
    }
}

/// Unpinned on purpose: `--platform` would force qemu on Apple Silicon.
pub(crate) fn build_args(
    tag: &str,
    context: &Path,
    repo_url: &str,
    with_github_token: bool,
) -> Vec<String> {
    let mut args = vec![
        "build".to_owned(),
        "--build-arg".to_owned(),
        format!("CONATION_REPO_URL={repo_url}"),
        "--tag".to_owned(),
        tag.to_owned(),
    ];
    if with_github_token {
        args.extend([
            "--secret".to_owned(),
            format!("id=github_token,env={BUILDKIT_GITHUB_TOKEN_ENV}"),
        ]);
    }
    args.push(context.display().to_string());
    args
}

fn safe_repo_url(url: &str) -> bool {
    let Some(path) = url.strip_prefix("https://github.com/") else {
        return false;
    };
    !path.is_empty()
        && !url.contains(['@', '?', '#'])
        && path
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | '/'))
}

/// `docker build` the sandbox image when local sandboxes are on.
///
/// `no_build` skips the invocation so `--no-build` stack-up can use a
/// preloaded tag. Dry-run notes the plan and does not invoke Docker.
pub fn ensure(stage: &Stage, env: &BTreeMap<String, String>, no_build: bool) -> Result<()> {
    let Some(plan) = EnsurePlan::from_env(env) else {
        return Ok(());
    };
    if no_build {
        stage.note(&format!(
            "sandbox image: skipping build (--no-build); using {}",
            plan.tag
        ));
        return Ok(());
    }
    if stage.is_dry_run() {
        stage.note(&format!("sandbox image: would build {}", plan.tag));
        return Ok(());
    }
    let context = super::repo_root().join(CONTEXT_REL);
    let repo_url = conation_env_var::maybe_read_env("CONATION_REPO_URL")
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_REPO_URL.to_owned());
    if !safe_repo_url(&repo_url) {
        bail!("CONATION_REPO_URL must be a credential-free https://github.com repository URL");
    }
    let github_token = conation_env_var::maybe_read_env("GH_TOKEN")
        .filter(|value| !value.is_empty())
        .or_else(|| {
            conation_env_var::maybe_read_env("GITHUB_TOKEN").filter(|value| !value.is_empty())
        });
    let mut build = Command::new("docker");
    build.args(build_args(
        &plan.tag,
        &context,
        &repo_url,
        github_token.is_some(),
    ));
    if let Some(token) = github_token {
        // Stage output records arguments, never command environments. BuildKit
        // reads this variable into its ephemeral secret mount.
        build.env(BUILDKIT_GITHUB_TOKEN_ENV, token);
    }
    stage.run(&format!("Building sandbox image {}", plan.tag), &mut build)
}
