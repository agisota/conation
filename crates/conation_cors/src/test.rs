use super::*;

fn defaults() -> Vec<String> {
    DEFAULT_ALLOWED_ORIGINS
        .iter()
        .map(|origin| normalize_origin(origin).unwrap())
        .collect()
}

#[test]
fn allows_localhost_and_subdomain_localhost_dev_ports() {
    for origin in [
        "http://localhost:3000",
        "http://localhost:3999",
        "http://localhost:20000",
        "http://alice.localhost:3000",
        "http://carol.localhost:3005",
    ] {
        assert!(is_origin_allowed_with(origin, &defaults()), "{origin}");
    }
}

#[test]
fn rejects_non_local_and_out_of_range_origins() {
    for origin in [
        "http://localhost:2999",
        "http://localhost:9000",
        "http://alice.localhost:9000",
        "https://alice.localhost:3000",
        "http://evil-localhost:3000",
        "http://alice.localhost.evil.com:3000",
        "http://example.com:3000",
    ] {
        assert!(!is_origin_allowed_with(origin, &defaults()), "{origin}");
    }
}

#[test]
fn allows_static_origins() {
    assert!(is_origin_allowed_with("https://conation.dev", &defaults()));
    assert!(is_origin_allowed_with("tauri://localhost", &defaults()));
}

#[test]
fn configured_origins_are_exact_and_normalized() {
    let origins =
        parse_allowed_origins("https://workspace.example.org/, https://api.example.org:8443")
            .unwrap();

    assert!(is_origin_allowed_with(
        "https://workspace.example.org",
        &origins
    ));
    assert!(is_origin_allowed_with(
        "https://api.example.org:8443",
        &origins
    ));
    assert!(!is_origin_allowed_with(
        "https://workspace.example.org.attacker.test",
        &origins
    ));
    assert!(!is_origin_allowed_with(
        "http://workspace.example.org",
        &origins
    ));
}

#[test]
fn malformed_origin_configuration_is_rejected() {
    for origins in [
        "",
        "https://example.org/path",
        "https://user@example.org",
        "https://example.org?next=attacker",
        "javascript:alert(1)",
    ] {
        assert!(parse_allowed_origins(origins).is_err(), "{origins}");
    }
}

#[test]
fn macro_origins_are_not_implicit_defaults() {
    assert!(!is_origin_allowed_with("https://macro.com", &defaults()));
    assert!(!is_origin_allowed_with(
        "https://feature.preview.macro.com",
        &defaults()
    ));
}
