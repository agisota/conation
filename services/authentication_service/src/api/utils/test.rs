use super::*;

#[test]
fn defaults_use_conation_and_host_only_cookies() {
    assert_eq!(
        resolve_app_base_url(Environment::Production, None, None)
            .unwrap()
            .as_str(),
        "https://conation.dev/app"
    );
    assert_eq!(
        resolve_app_base_url(Environment::Develop, None, None)
            .unwrap()
            .as_str(),
        "https://dev.conation.dev/app"
    );
    assert_eq!(resolve_cookie_domain(None).unwrap(), None);
}

#[test]
fn custom_app_base_url_is_exact_and_may_include_a_path() {
    let url = resolve_app_base_url(
        Environment::Production,
        Some("https://workspace.example.org/conation"),
        None,
    )
    .unwrap();

    assert_eq!(url.as_str(), "https://workspace.example.org/conation");
    assert_eq!(
        url.origin().ascii_serialization(),
        "https://workspace.example.org"
    );
}

#[test]
fn malformed_app_base_urls_are_rejected() {
    for value in [
        "",
        "workspace.example.org",
        "javascript:alert(1)",
        "https://user@workspace.example.org/app",
        "https://workspace.example.org/app?next=attacker",
        "https://workspace.example.org/app#token",
    ] {
        assert!(
            resolve_app_base_url(Environment::Production, Some(value), None).is_err(),
            "{value}"
        );
    }
}

#[test]
fn cookie_domain_requires_a_bare_hostname() {
    assert_eq!(
        resolve_cookie_domain(Some(".conation.dev")).unwrap(),
        Some("conation.dev".to_owned())
    );
    for value in [
        "",
        "https://conation.dev",
        "conation.dev:443",
        "conation.dev/path",
    ] {
        assert!(resolve_cookie_domain(Some(value)).is_err(), "{value}");
    }
}

#[test]
fn local_frontend_port_is_validated() {
    assert_eq!(
        resolve_app_base_url(Environment::Local, None, Some("3456"))
            .unwrap()
            .as_str(),
        "http://localhost:3456/"
    );
    assert!(resolve_app_base_url(Environment::Local, None, Some("not-a-port")).is_err());
}
