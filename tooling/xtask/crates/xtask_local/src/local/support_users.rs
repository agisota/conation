//! Idempotent provisioning of the deployment-owned Conation support accounts.

use std::{collections::BTreeMap, process::Command};

use anyhow::Result;

use super::{
    identity,
    instance::{Instance, Port},
    proxy, repo_root,
    stage::Stage,
};

#[cfg(test)]
mod test;

const MANIFEST_RELATIVE_PATH: &str = "infra/stacks/fusionauth-instance/support-users.json";
const PROVISION_SCRIPT_RELATIVE_PATH: &str = "tooling/scripts/provision-conation-support-users.sh";

pub(crate) fn manifest_path() -> std::path::PathBuf {
    repo_root().join(MANIFEST_RELATIVE_PATH)
}

/// Reconcile the three support identities after authentication-service is
/// healthy. User creation therefore reaches the normal FusionAuth webhook and
/// creates the matching application profile rather than leaving an auth-only
/// phantom participant.
pub fn provision(
    stage: &Stage,
    instance: &Instance,
    env: &BTreeMap<String, String>,
    default_avatar_base_url: &str,
) -> Result<()> {
    let mut cmd = command(instance, env, default_avatar_base_url);
    stage.run("Provisioning Conation support users", &mut cmd)
}

fn command(
    instance: &Instance,
    env: &BTreeMap<String, String>,
    default_avatar_base_url: &str,
) -> Command {
    let fusionauth_url = format!("http://localhost:{}", instance.port(Port::FusionAuth));
    let avatar_base_url = env
        .get("CONATION_SUPPORT_AVATAR_BASE_URL")
        .cloned()
        .unwrap_or_else(|| reachable_default_avatar_base_url(instance, default_avatar_base_url));
    let auth_health_url = format!("{}/auth/health", proxy::url(instance));

    let mut cmd = Command::new("bash");
    cmd.current_dir(repo_root())
        .arg(repo_root().join(PROVISION_SCRIPT_RELATIVE_PATH))
        .env("FUSIONAUTH_URL", fusionauth_url)
        // Deterministic and checked-in for the isolated local stack only. A
        // real self-host deployment supplies its own API key to the same script.
        .env("FUSIONAUTH_API_KEY", identity::FUSIONAUTH_API_KEY)
        .env("FUSIONAUTH_APPLICATION_ID", identity::APPLICATION_ID)
        .env("CONATION_SUPPORT_AVATAR_BASE_URL", avatar_base_url)
        .env("CONATION_AUTH_HEALTH_URL", auth_health_url)
        .env("CONATION_SUPPORT_USERS_MANIFEST", manifest_path());

    cmd
}

fn reachable_default_avatar_base_url(instance: &Instance, default_avatar_base_url: &str) -> String {
    let trimmed = default_avatar_base_url.trim_end_matches('/');
    if trimmed == proxy::url(instance) {
        format!("{trimmed}/app")
    } else {
        trimmed.to_string()
    }
}
