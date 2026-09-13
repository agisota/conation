use super::*;

fn network<'a>(value: &'a Value, name: &str) -> &'a serde_yaml::Mapping {
    value
        .as_mapping()
        .and_then(|root| root.get(Value::from("networks")))
        .and_then(Value::as_mapping)
        .and_then(|networks| networks.get(Value::from(name)))
        .and_then(Value::as_mapping)
        .unwrap_or_else(|| panic!("generated override is missing network '{name}'"))
}

#[test]
fn named_override_assigns_ipam_to_compose_managed_networks() {
    let instance = Instance::derive(Some("agent-a"), None).unwrap();
    let mut override_value = Value::Mapping(serde_yaml::Mapping::new());

    set_external_networks_and_volumes(&mut override_value, &instance);

    for (name, expected_subnet) in [
        ("services", "10.254.112.0/24"),
        ("auth-internal", "10.253.112.0/24"),
    ] {
        let config = network(&override_value, name);
        assert_eq!(
            config.get(Value::from("driver")).and_then(Value::as_str),
            Some("bridge")
        );
        assert_eq!(
            config
                .get(Value::from("ipam"))
                .and_then(Value::as_mapping)
                .and_then(|ipam| ipam.get(Value::from("config")))
                .and_then(Value::as_sequence)
                .and_then(|configs| configs.first())
                .and_then(Value::as_mapping)
                .and_then(|config| config.get(Value::from("subnet")))
                .and_then(Value::as_str),
            Some(expected_subnet)
        );
    }
}

#[test]
fn named_override_preserves_external_database_and_auth_mappings() {
    let instance = Instance::derive(Some("agent-a"), None).unwrap();
    let mut override_value = Value::Mapping(serde_yaml::Mapping::new());

    set_external_networks_and_volumes(&mut override_value, &instance);

    for (name, expected_network_name) in
        [("databases", "databases-agent-a"), ("auth", "auth-agent-a")]
    {
        let config = network(&override_value, name);
        assert_eq!(
            config.get(Value::from("external")).and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(
            config.get(Value::from("name")).and_then(Value::as_str),
            Some(expected_network_name)
        );
    }
}

fn allowed_origins_value(env: &dct::Environment) -> Option<&str> {
    let dct::Environment::KvPair(map) = env else {
        return None;
    };
    match map.get("ALLOWED_ORIGINS")?.as_ref()? {
        dct::SingleValue::String(s) => Some(s.as_str()),
        other => panic!("ALLOWED_ORIGINS must be a string, got {other:?}"),
    }
}

#[test]
fn authentication_override_pins_tauri_https_localhost() {
    let env = rust_service_environment("authentication-service", 24010);
    let origins = allowed_origins_value(&env).expect("ALLOWED_ORIGINS");
    for origin in [
        "http://localhost:24010",
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
        "https://localhost",
    ] {
        assert!(
            origins.split(',').any(|item| item == origin),
            "compose auth ALLOWED_ORIGINS missing {origin}: {origins}"
        );
    }
}

#[test]
fn non_auth_override_does_not_pin_allowed_origins() {
    let env = rust_service_environment("email-service", 24010);
    assert!(
        allowed_origins_value(&env).is_none(),
        "non-auth override must keep ALLOWED_ORIGINS on env_file"
    );
}
