use super::*;
use crate::local::inventory;
use std::collections::BTreeMap;

fn resolved_env(instance: &Instance, gmail_forwarder: bool) -> env_layer::ResolvedEnv {
    let mut merged = BTreeMap::new();
    if gmail_forwarder {
        merged.insert(
            "GMAIL_FORWARDER_SA_KEY".to_string(),
            "configured".to_string(),
        );
    }
    env_layer::ResolvedEnv {
        merged,
        doppler_used: false,
        env_file: None,
        generated_path: instance.artifact_dir().join("local.generated.env"),
        generated_env_changed: true,
        generated_env_fingerprint: "next".to_string(),
    }
}

/// `up` writes stack.json and `update`/`status` read it back — the record and
/// the mode labels must stay in agreement.
#[test]
fn stack_state_roundtrips() {
    let state = StackState {
        mode: "local".to_string(),
        frontend: "static".to_string(),
        binaries_dir: Some(PathBuf::from("/tmp/binaries")),
        generated_env_fingerprint: Some("fingerprint".to_string()),
        caddyfile_fingerprint: Some(proxy::caddyfile_fingerprint(Mode::Local, true)),
    };
    let json = serde_json::to_string(&state).unwrap();
    let back: StackState = serde_json::from_str(&json).unwrap();
    assert_eq!(back.mode, "local");
    assert_eq!(back.frontend, "static");
    assert_eq!(back.binaries_dir, Some(PathBuf::from("/tmp/binaries")));
    assert_eq!(
        back.generated_env_fingerprint.as_deref(),
        Some("fingerprint")
    );
    assert_eq!(
        back.caddyfile_fingerprint.as_deref(),
        Some(proxy::caddyfile_fingerprint(Mode::Local, true).as_str())
    );
    assert!(mode_from_label(&back.mode).is_ok());
    assert!(mode_from_label("nonsense").is_err());
}

#[test]
fn legacy_stack_state_has_no_binaries_dir() {
    let state: StackState =
        serde_json::from_str(r#"{"mode":"local","frontend":"static"}"#).unwrap();
    assert_eq!(state.binaries_dir, None);
    assert_eq!(state.generated_env_fingerprint, None);
    assert_eq!(state.caddyfile_fingerprint, None);
    assert!(generated_caddyfile_drifted(&state, Mode::Local));
}

#[test]
fn clearing_state_invalidates_a_previous_headless_stack() {
    let instance =
        Instance::derive(Some(&format!("state-clear-{}", std::process::id())), None).unwrap();
    write_state(
        &instance,
        &StackState {
            mode: "local".to_string(),
            frontend: "static".to_string(),
            binaries_dir: None,
            generated_env_fingerprint: None,
            caddyfile_fingerprint: None,
        },
    )
    .unwrap();
    assert!(read_state(&instance).is_some());
    clear_state(&instance).unwrap();
    assert!(read_state(&instance).is_none());
    clear_state(&instance).unwrap();
    let _ = std::fs::remove_dir_all(instance.artifact_dir());
}

#[test]
fn environment_refresh_is_skipped_without_generated_env_drift() {
    assert_eq!(environment_refresh_scope(false, false), None);
    assert_eq!(environment_refresh_scope(false, true), None);
    assert_eq!(
        environment_refresh_scope(true, false),
        Some(EnvironmentRefreshScope::AllConsumers)
    );
    assert_eq!(
        environment_refresh_scope(true, true),
        Some(EnvironmentRefreshScope::AuxiliaryConsumers)
    );
}

#[test]
fn persisted_environment_fingerprint_survives_a_failed_prior_update() {
    let instance = Instance::derive(
        Some(&format!("env-fingerprint-{}", std::process::id())),
        None,
    )
    .unwrap();
    let env = resolved_env(&instance, false);
    let stale_state = StackState {
        mode: "local".to_string(),
        frontend: "static".to_string(),
        binaries_dir: None,
        generated_env_fingerprint: Some("previous".to_string()),
        caddyfile_fingerprint: Some(proxy::caddyfile_fingerprint(Mode::Local, true)),
    };

    // Even if a failed prior update already wrote the same generated file,
    // the applied marker still makes the retry recreate its consumers.
    let retried_env = env_layer::ResolvedEnv {
        generated_env_changed: false,
        ..env
    };
    assert!(generated_environment_drifted(&stale_state, &retried_env));
    assert_eq!(
        environment_refresh_scope(
            generated_environment_drifted(&stale_state, &retried_env),
            false,
        ),
        Some(EnvironmentRefreshScope::AllConsumers)
    );
}

#[test]
fn environment_refresh_command_is_scoped_to_env_consumers() {
    let instance =
        Instance::derive(Some(&format!("env-refresh-{}", std::process::id())), None).unwrap();
    let env = resolved_env(&instance, true);
    let command = environment_refresh_command(
        &instance,
        &env,
        Mode::Local,
        EnvironmentRefreshScope::AllConsumers,
    );
    let args: Vec<String> = command
        .get_args()
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect();

    assert_eq!(command.get_program(), "docker");
    assert!(args.windows(5).any(|window| {
        window
            == [
                "up",
                "-d",
                "--force-recreate",
                "--no-deps",
                "--remove-orphans",
            ]
    }));
    for service in inventory::services_for_mode(Mode::Local) {
        assert!(args.contains(&service.compose_name.to_string()));
    }
    for service in ENV_FILE_AUXILIARY_SERVICES {
        assert!(args.contains(&service.to_string()));
    }
    assert!(args.contains(&"gmail_forwarder".to_string()));

    for untouched in [
        "proxy",
        "postgres",
        "redis",
        "opensearch",
        "kafka",
        "fusionauth",
        "localstack",
        "mailpit",
        "static_file_cdn",
        "websocket_service",
        "down",
        "stop",
    ] {
        assert!(
            !args.contains(&untouched.to_string()),
            "unexpected {untouched}"
        );
    }
    let environment: BTreeMap<String, Option<String>> = command
        .get_envs()
        .map(|(key, value)| {
            (
                key.to_string_lossy().into_owned(),
                value.map(|value| value.to_string_lossy().into_owned()),
            )
        })
        .collect();
    assert_eq!(
        environment.get("COMPOSE_PROJECT_NAME"),
        Some(&Some(instance.project_name().to_string()))
    );
    assert_eq!(
        environment.get("CONATION_ENV_FILE"),
        Some(&Some(env.generated_path.display().to_string()))
    );
}

#[test]
fn proxy_refresh_is_skipped_when_caddyfile_marker_matches() {
    let state = StackState {
        mode: "local".to_string(),
        frontend: "static".to_string(),
        binaries_dir: None,
        generated_env_fingerprint: None,
        caddyfile_fingerprint: Some(proxy::caddyfile_fingerprint(Mode::Local, true)),
    };

    assert!(!generated_caddyfile_drifted(&state, Mode::Local));
    assert_eq!(
        proxy_refresh_plan(
            generated_caddyfile_drifted(&state, Mode::Local),
            false,
            false
        ),
        ProxyRefreshPlan {
            regenerate_compose: false,
            recreate_proxy: false,
        }
    );
}

#[test]
fn proxy_refresh_recreates_only_proxy_when_caddyfile_marker_drifts() {
    let state = StackState {
        mode: "local".to_string(),
        frontend: "static".to_string(),
        binaries_dir: None,
        generated_env_fingerprint: None,
        caddyfile_fingerprint: Some("caddyfile-v1:previous".to_string()),
    };

    assert!(generated_caddyfile_drifted(&state, Mode::Local));
    assert_eq!(
        proxy_refresh_plan(
            generated_caddyfile_drifted(&state, Mode::Local),
            false,
            false
        ),
        ProxyRefreshPlan {
            regenerate_compose: true,
            recreate_proxy: true,
        }
    );
}

#[test]
fn frontend_refresh_applies_drifted_caddyfile_without_double_proxy_recreate() {
    let state = StackState {
        mode: "local".to_string(),
        frontend: "static".to_string(),
        binaries_dir: None,
        generated_env_fingerprint: None,
        caddyfile_fingerprint: None,
    };

    assert_eq!(
        proxy_refresh_plan(
            generated_caddyfile_drifted(&state, Mode::Local),
            false,
            true
        ),
        ProxyRefreshPlan {
            regenerate_compose: true,
            recreate_proxy: false,
        }
    );
}

#[test]
fn proxy_recreate_command_is_named_no_deps_proxy_only() {
    let instance =
        Instance::derive(Some(&format!("proxy-refresh-{}", std::process::id())), None).unwrap();
    let env = resolved_env(&instance, false);
    let command = proxy_recreate_command(&instance, &env);
    let args: Vec<String> = command
        .get_args()
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect();

    assert_eq!(command.get_program(), "docker");
    assert!(args.windows(PROXY_RECREATE_ARGS.len()).any(|window| {
        window
            == PROXY_RECREATE_ARGS
                .iter()
                .map(|arg| arg.to_string())
                .collect::<Vec<_>>()
    }));
    for untouched in [
        "postgres",
        "redis",
        "opensearch",
        "kafka",
        "fusionauth",
        "localstack",
        "mailpit",
        "document-storage-service",
    ] {
        assert!(
            !args.contains(&untouched.to_string()),
            "unexpected {untouched}"
        );
    }
}
