use super::*;
use std::{cell::RefCell, collections::BTreeSet};

/// Every mode whose spec we assert invariants over.
const MODES: &[Mode] = &[Mode::Local, Mode::Dev];

#[test]
fn package_metadata_uses_conation_display_brand() {
    let manifest = include_str!("../../Cargo.toml");

    assert!(manifest.contains("xtask local: Conation local & dev stack orchestration"));
    assert!(!manifest.contains("xtask local: Macro local & dev stack orchestration"));
}

/// Cross-field design rules every [`ModeSpec`] must satisfy. These encode what
/// makes a mode *coherent* — a new mode that trips one of these is a bug, not a
/// new policy — so they're the real guard on the table, not a restatement of it.
#[test]
fn mode_specs_are_coherent() {
    for &mode in MODES {
        let s = mode.spec();
        // You either own the local plumbing (LocalEnv: dummy creds + localstack
        // endpoint) or you point at deployed AWS and strip those — never both.
        assert!(
            !(s.overlay_local_env && s.uses_remote_aws),
            "{}: overlay_local_env and uses_remote_aws are mutually exclusive",
            s.label
        );
        // Migrations only make sense against a database this mode runs itself.
        assert!(
            !s.migrates_db || s.runs_local_infra,
            "{}: migrates_db requires runs_local_infra",
            s.label
        );
    }
}

#[test]
fn support_users_are_provisioned_only_after_backend_health() {
    let events = RefCell::new(Vec::new());

    wait_then_provision_support_users(
        || {
            events.borrow_mut().push("backend-ready");
            Ok(())
        },
        || {
            events.borrow_mut().push("support-users-provisioned");
            Ok(())
        },
    )
    .unwrap();

    assert_eq!(
        events.into_inner(),
        ["backend-ready", "support-users-provisioned"]
    );
}

#[test]
fn support_user_provisioning_stops_when_backend_health_fails() {
    let provision_called = std::cell::Cell::new(false);

    let result = wait_then_provision_support_users(
        || anyhow::bail!("backend unavailable"),
        || {
            provision_called.set(true);
            Ok(())
        },
    );

    assert!(result.is_err());
    assert!(!provision_called.get());
}

#[test]
fn durable_bake_covers_every_repository_built_local_image() {
    fn direct_build_services(path: &std::path::Path) -> BTreeSet<String> {
        let raw = std::fs::read_to_string(path).unwrap();
        let compose: serde_yaml::Value = serde_yaml::from_str(&raw).unwrap();
        compose["services"]
            .as_mapping()
            .unwrap()
            .iter()
            .filter(|(_, service)| {
                service
                    .as_mapping()
                    .is_some_and(|service| service.contains_key("build"))
            })
            .map(|(name, _)| name.as_str().unwrap().to_string())
            .collect()
    }

    let mut expected = direct_build_services(&repo_root().join("docker/docker-compose.yml"));
    expected.extend(direct_build_services(
        &repo_root().join("docker/docker-compose-databases.yml"),
    ));
    // The generated override adds this build definition.
    expected.insert("sdk-webhook-relay".to_string());
    // The Rust services use the host-built runtime image; this profile-only
    // helper is intentionally never needed by local stack preparation.
    expected.remove("rust_services_image");
    for service in inventory::RUST_SERVICES {
        expected.remove(service.compose_name);
    }

    let actual: BTreeSet<_> = LOCAL_BUILD_SERVICE_IMAGES
        .iter()
        .map(|name| name.to_string())
        .collect();
    assert_eq!(actual, expected);
    assert_eq!(
        LOCAL_PULL_SERVICE_IMAGES,
        ["proxy", "mailpit", "static_file_cdn"]
    );
}
