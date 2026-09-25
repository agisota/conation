//! FusionAuth local bootstrap: generate the per-instance kickstart artifacts
//! and wait for readiness. No Pulumi, no API read-back, no patch step.

use std::{collections::BTreeMap, process::Command};
use sha2::{Digest, Sha256};

use anyhow::{Context, Result};

use super::instance::{Instance, Port};
use super::{gen_compose, identity, kickstart, stage::Stage};

#[cfg(test)]
mod test;

/// The FusionAuth lambda sources, read from the tracked templates at
/// generation time (anchored on [`xtask_paths::repo_root`], so any cwd works).
/// `populate_jwt_local.js` is the unlicensed local variant (see its header);
/// the reconcile lambda is the same file production deploys via Pulumi.
const POPULATE_JWT_LAMBDA: xtask_paths::RepoFile<'static> =
    xtask_paths::RepoFile::new("infra/stacks/fusionauth-instance/templates/populate_jwt_local.js");
const RECONCILE_LAMBDA: xtask_paths::RepoFile<'static> = xtask_paths::RepoFile::new(
    "infra/stacks/fusionauth-instance/templates/reconcile_secondary_idp_link.js",
);

fn read_lambda(file: xtask_paths::RepoFile<'static>) -> Result<String> {
    let path = xtask_paths::repo_root().join(file.as_str());
    std::fs::read_to_string(&path).with_context(|| format!("reading {}", path.display()))
}


/// Generate kickstart config using the resolved service-auth secret. The
/// kickstart applies only to an empty FusionAuth database; `stack update`
/// compares its resolved key with the fingerprint recorded after initialization.
pub fn write_kickstart_for_env(
    instance: &Instance,
    google: Option<&kickstart::GoogleIdp>,
    github: Option<&kickstart::GithubIdp>,
    env: &BTreeMap<String, String>,
) -> Result<()> {
    let key = resolved_internal_auth_key(env)?;
    write_kickstart_with_key(instance, google, github, &key)
}

pub(super) fn validate_auth_key_env(env: &BTreeMap<String, String>) -> Result<()> {
    resolved_internal_auth_key(env).map(|_| ())
}

fn resolved_internal_auth_key(env: &BTreeMap<String, String>) -> Result<String> {
    const ALIASES: [&str; 4] = [
        "INTERNAL_API_SECRET_KEY",
        "INTERNAL_API_KEY",
        "INTERNAL_AUTH_KEY",
        "AUTHENTICATION_SERVICE_SECRET_KEY",
    ];

    let json_secrets = env
        .get("APP_SECRETS_JSON")
        .map(|raw| {
            serde_json::from_str::<serde_json::Value>(raw)
                .context("APP_SECRETS_JSON must contain a JSON object")
        })
        .transpose()?;
    if let Some(value) = &json_secrets {
        anyhow::ensure!(
            value.is_object(),
            "APP_SECRETS_JSON must contain a JSON object"
        );
    }

    let get = |alias: &str| -> Result<&str> {
        let value = if let Some(secrets) = &json_secrets {
            secrets
                .as_object()
                .and_then(|object| object.get(alias))
                .and_then(serde_json::Value::as_str)
        } else {
            env.get(alias).map(String::as_str)
        };
        value.with_context(|| format!("resolved {alias} is missing or not a string"))
    };

    let key = get(ALIASES[0])?;
    anyhow::ensure!(
        !key.trim().is_empty(),
        "resolved INTERNAL_API_SECRET_KEY is missing or empty"
    );
    anyhow::ensure!(
        key.bytes().all(|byte| (b' '..=b'~').contains(&byte)),
        "resolved INTERNAL_API_SECRET_KEY must be a valid HTTP header value"
    );

    for alias in &ALIASES[1..] {
        anyhow::ensure!(
            get(alias)? == key,
            "resolved {alias} must match INTERNAL_API_SECRET_KEY"
        );
    }
    Ok(key.to_owned())
}

pub(super) fn auth_key_fingerprint(env: &BTreeMap<String, String>) -> Result<String> {
    let key = resolved_internal_auth_key(env)?;
    Ok(format!("{:x}", Sha256::digest(key.as_bytes())))
}

pub(super) fn ensure_auth_key_fingerprint_matches(
    initialized: Option<&str>,
    env: &BTreeMap<String, String>,
) -> Result<()> {
    let initialized = initialized.context(
        "this stack has no initialized auth-key fingerprint; run `stack up` to reinitialize",
    )?;
    anyhow::ensure!(
        initialized == auth_key_fingerprint(env)?,
        "resolved auth key differs from this stack's initialized FusionAuth key; run `stack up` to reinitialize"
    );
    Ok(())
}

pub(super) fn write_kickstart_with_key(
    instance: &Instance,
    google: Option<&kickstart::GoogleIdp>,
    github: Option<&kickstart::GithubIdp>,
    internal_auth_key: &str,
) -> Result<()> {
    let dir = gen_compose::kickstart_dir(instance);
    std::fs::create_dir_all(&dir)
        .with_context(|| format!("creating kickstart dir {}", dir.display()))?;

    let doc = kickstart::build_with_internal_auth_key(
        instance.port(Port::Frontend),
        instance.port(Port::Auth),
        instance.port(Port::DocCognition),
        &read_lambda(POPULATE_JWT_LAMBDA)?,
        &read_lambda(RECONCILE_LAMBDA)?,
        internal_auth_key,
        google,
        github,
    );
    let json = serde_json::to_string_pretty(&doc)? + "\n";
    std::fs::write(dir.join("kickstart.json"), json)
        .with_context(|| format!("writing {}", dir.join("kickstart.json").display()))?;
    Ok(())
}

/// Block until the kickstart has fully applied (first boot against an empty DB
/// is slow). Runs as a stage so it shows the spinner.
///
/// Polls the kickstart's OWN artifacts — a tenant fetch authorized by the
/// kickstart API key — NOT `/api/status`: FusionAuth reports status Ok while
/// the kickstart is still applying, and the snapshot save stops the containers
/// right after this wait. Gating on status alone once froze a mid-kickstart DB
/// into a snapshot (no tenant), and every stack restored from it 500'd at
/// login with `InvalidTenantIdException` — while the key never changed, so the
/// bad snapshot was sticky. The fetch below succeeds only once the API key,
/// the tenant, and the application all exist (the kickstart creates the
/// application after the tenant).
pub fn wait_ready(stage: &Stage, instance: &Instance) -> Result<()> {
    let url = format!(
        "http://localhost:{}/api/application/{}",
        instance.port(Port::FusionAuth),
        identity::APPLICATION_ID,
    );
    // Require an actual 200: `curl -f` only fails on 400+, so FusionAuth's
    // maintenance-mode 302 (e.g. after a boot-time DB connect failure) would
    // otherwise pass as ready and every later login would 500.
    let script = format!(
        "for i in $(seq 1 480); do [ \"$(curl -sS -o /dev/null -w '%{{http_code}}' --max-time 3 -H 'Authorization: {key}' {url} 2>/dev/null)\" = 200 ] && exit 0; sleep 0.5; done; \
         echo 'timed out waiting for the FusionAuth kickstart (a 302 here means maintenance mode: FusionAuth could not reach its db)'; exit 1",
        key = identity::FUSIONAUTH_API_KEY,
    );
    let mut cmd = Command::new("bash");
    cmd.arg("-lc").arg(script);
    stage.run("Waiting for FusionAuth (kickstart)", &mut cmd)
}
