use super::*;

#[test]
fn conation_defaults_are_allowed_without_legacy_macro_origins() {
    assert!(is_origin_allowed("https://conation.dev", None));
    assert!(is_origin_allowed("https://app.conation.dev", None));
    assert!(!is_origin_allowed("https://macro.com", None));
    assert!(!is_origin_allowed(
        "https://feature.preview.macro.com",
        None
    ));
}

#[test]
fn operator_allowlist_is_exact_and_replaces_defaults() {
    let configured = "https://workspace.example.org/,https://api.example.org:8443";

    assert!(is_origin_allowed(
        "https://workspace.example.org",
        Some(configured)
    ));
    assert!(is_origin_allowed(
        "https://api.example.org:8443",
        Some(configured)
    ));
    assert!(!is_origin_allowed(
        "https://workspace.example.org.attacker.test",
        Some(configured)
    ));
    assert!(!is_origin_allowed("https://conation.dev", Some(configured)));
}

#[test]
fn malformed_operator_allowlist_fails_closed() {
    for configured in [
        "",
        "https://workspace.example.org/path",
        "https://attacker@workspace.example.org",
        "javascript:alert(1)",
    ] {
        assert!(!is_origin_allowed(
            "https://workspace.example.org",
            Some(configured)
        ));
    }
}
