use super::*;

#[test]
fn keeps_resolved_database_url_when_shell_has_local_default() {
    assert!(!should_overlay_process_env(
        "DATABASE_URL",
        "postgres://user:password@localhost:5432/macrodb"
    ));
    assert!(!should_overlay_process_env(
        "DATABASE_URL",
        "postgres://user:password@postgres:5432/macrodb"
    ));
}

#[test]
fn still_allows_non_local_database_overrides() {
    assert!(should_overlay_process_env(
        "DATABASE_URL",
        "postgres://user:password@dev.example.com:5432/macrodb"
    ));
}

#[test]
fn generated_environment_detects_a_canonical_key_rename() {
    let legacy = BTreeMap::from([(
        "MACRO_MCP_URL".to_string(),
        "https://api.example.test/mcp".to_string(),
    )]);
    let canonical = BTreeMap::from([(
        "CONATION_MCP_URL".to_string(),
        "https://api.example.test/mcp".to_string(),
    )]);

    let prior = render_dotenv(&legacy);
    let next = render_dotenv(&canonical);

    assert!(generated_env_changed(Ok(prior.into_bytes()), next.as_bytes()).unwrap());
    assert!(!generated_env_changed(Ok(next.clone().into_bytes()), next.as_bytes()).unwrap());
    assert!(
        generated_env_changed(
            Err(std::io::Error::from(std::io::ErrorKind::NotFound)),
            next.as_bytes(),
        )
        .unwrap()
    );
    assert_ne!(
        generated_env_fingerprint(&legacy),
        generated_env_fingerprint(&canonical)
    );
}

#[test]
fn dev_overrides_remove_explicit_s3_endpoint() {
    let instance = Instance::derive(Some("dev-s3-endpoint"), None).unwrap();
    let mut env = BTreeMap::from([(
        "S3_ENDPOINT_URL".to_string(),
        "http://minio.internal:9000".to_string(),
    )]);

    apply_dev_overrides(&instance, &mut env);

    assert!(!env.contains_key("S3_ENDPOINT_URL"));
}
