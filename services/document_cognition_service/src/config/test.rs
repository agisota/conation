use super::*;

#[test]
fn pipedream_defaults_use_conation_origins() {
    let mut config = Config::new_empty_for_test();

    config.environment = Environment::Production;
    assert_eq!(
        config.resolved_pipedream_allowed_origins().unwrap(),
        vec!["https://conation.dev"]
    );

    config.environment = Environment::Develop;
    assert_eq!(
        config.resolved_pipedream_allowed_origins().unwrap(),
        vec!["https://dev.conation.dev", "http://localhost:3000"]
    );
}

#[test]
fn pipedream_custom_origins_are_exact_and_normalized() {
    let mut config = Config::new_empty_for_test();
    config.pipedream_allowed_origins = PipedreamAllowedOrigins::new_testing(
        "https://workspace.example.org/,https://connect.example.org:8443",
    );

    assert_eq!(
        config.resolved_pipedream_allowed_origins().unwrap(),
        vec![
            "https://workspace.example.org",
            "https://connect.example.org:8443"
        ]
    );
}

#[test]
fn pipedream_malformed_origins_fail_closed() {
    for value in [
        "",
        "https://workspace.example.org/path",
        "https://attacker@workspace.example.org",
        "javascript:alert(1)",
    ] {
        let mut config = Config::new_empty_for_test();
        config.pipedream_allowed_origins = PipedreamAllowedOrigins::new_testing(value);
        assert!(
            config.resolved_pipedream_allowed_origins().is_err(),
            "{value}"
        );
    }
}
