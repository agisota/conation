use std::collections::HashSet;
use std::ffi::OsStr;

use crate::local::frontend;

use super::*;

#[test]
fn manifest_defines_the_three_russian_support_profiles_and_local_avatars() {
    let manifest = std::fs::read_to_string(manifest_path()).expect("read support-user manifest");
    let profiles: Vec<serde_json::Value> =
        serde_json::from_str(&manifest).expect("parse support-user manifest");

    let actual = profiles
        .iter()
        .map(|profile| {
            (
                profile["email"].as_str().expect("email"),
                profile["role"].as_str().expect("role"),
                profile["avatarPath"].as_str().expect("avatarPath"),
            )
        })
        .collect::<Vec<_>>();
    assert_eq!(
        actual,
        [
            (
                "pythia@conation.dev",
                "Служба поддержки",
                "/support-avatars/pythia.svg",
            ),
            (
                "tars@conation.dev",
                "Технический директор",
                "/support-avatars/tars.svg",
            ),
            (
                "ramzan.kadyrov@conation.dev",
                "Генеральный директор",
                "/support-avatars/ramzan-kadyrov.svg",
            ),
        ]
    );

    let ids = profiles
        .iter()
        .map(|profile| profile["fusionAuthId"].as_str().expect("fusionAuthId"))
        .collect::<HashSet<_>>();
    assert_eq!(ids.len(), profiles.len(), "FusionAuth ids must be unique");

    for (_, _, avatar_path) in actual {
        let asset = repo_root()
            .join("apps/web/public")
            .join(avatar_path.trim_start_matches('/'));
        assert!(
            asset.is_file(),
            "missing support avatar: {}",
            asset.display()
        );
    }
}

#[test]
fn named_instance_command_targets_only_that_instances_endpoints() {
    let instance = Instance::derive(Some("headless-support"), Some(31_000)).unwrap();
    let cmd = command(&instance, &BTreeMap::new(), &proxy::url(&instance));
    let env = cmd
        .get_envs()
        .filter_map(|(key, value)| value.map(|value| (key, value)))
        .collect::<BTreeMap<_, _>>();

    assert_eq!(cmd.get_program(), OsStr::new("bash"));
    assert_eq!(
        cmd.get_args().count(),
        1,
        "only the provisioning script runs"
    );
    assert_eq!(
        env.get(OsStr::new("FUSIONAUTH_URL")).copied(),
        Some(OsStr::new("http://localhost:31005"))
    );
    assert_eq!(
        env.get(OsStr::new("CONATION_AUTH_HEALTH_URL")).copied(),
        Some(OsStr::new("http://localhost:31009/auth/health"))
    );
    assert_eq!(
        env.get(OsStr::new("CONATION_SUPPORT_AVATAR_BASE_URL"))
            .copied(),
        Some(OsStr::new("http://localhost:31009/app"))
    );
    assert_eq!(
        env.get(OsStr::new("CONATION_SUPPORT_AVATAR_BASE_URL"))
            .and_then(|value| value.to_str()),
        Some(frontend::static_url(&instance).trim_end_matches('/'))
    );
}

#[test]
fn explicit_avatar_origin_overrides_the_mode_default() {
    let instance = Instance::derive(Some("headless-support"), Some(31_000)).unwrap();
    let env = BTreeMap::from([(
        "CONATION_SUPPORT_AVATAR_BASE_URL".to_string(),
        "https://assets.conation.dev".to_string(),
    )]);
    let cmd = command(&instance, &env, &proxy::url(&instance));
    let command_env = cmd
        .get_envs()
        .filter_map(|(key, value)| value.map(|value| (key, value)))
        .collect::<BTreeMap<_, _>>();

    assert_eq!(
        command_env
            .get(OsStr::new("CONATION_SUPPORT_AVATAR_BASE_URL"))
            .copied(),
        Some(OsStr::new("https://assets.conation.dev"))
    );
}

#[test]
fn run_local_dev_server_avatar_origin_is_preserved() {
    let instance = Instance::derive(Some("attached-support"), Some(31_000)).unwrap();
    let default_avatar_base_url = format!("http://localhost:{}", instance.port(Port::Frontend));
    let cmd = command(&instance, &BTreeMap::new(), &default_avatar_base_url);
    let command_env = cmd
        .get_envs()
        .filter_map(|(key, value)| value.map(|value| (key, value)))
        .collect::<BTreeMap<_, _>>();

    assert_eq!(
        command_env
            .get(OsStr::new("CONATION_SUPPORT_AVATAR_BASE_URL"))
            .copied(),
        Some(OsStr::new("http://localhost:31010"))
    );
}
