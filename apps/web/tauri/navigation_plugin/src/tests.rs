use super::*;
use crate::scheme::MacroScheme;

/// Mirrors the app's real config: the allowlist holds only the SPA's own
/// origins, and the configured Conation host is the app-link host.
fn test_plugin() -> MacroNavigationPlugin {
    MacroNavigationPlugin::new(&[
        "tauri://localhost",
        "http://tauri.localhost",
        "http://localhost:3000",
    ])
    .unwrap()
    .with_app_link_hosts(&["conation.dev"])
}

#[test]
fn get_destination_app_link_for_conation_app_path() {
    let plugin = test_plugin();
    let url = Url::parse("https://conation.dev/app/component/doc123").unwrap();
    match plugin.get_destination(&url) {
        NavigationOutput::AppLink(scheme) => {
            assert_eq!(scheme.path(), "/component/doc123");
            assert_eq!(scheme.query(), None);
        }
        other => panic!("expected AppLink, got {other:?}"),
    }
}

#[test]
fn get_destination_app_link_preserves_query() {
    let plugin = test_plugin();
    let url = Url::parse("https://conation.dev/app/component/doc123?foo=bar").unwrap();
    match plugin.get_destination(&url) {
        NavigationOutput::AppLink(scheme) => {
            assert_eq!(scheme.path(), "/component/doc123");
            assert_eq!(scheme.query(), Some("foo=bar"));
        }
        other => panic!("expected AppLink, got {other:?}"),
    }
}

#[test]
fn get_destination_app_link_strips_www() {
    let plugin = test_plugin();
    let url = Url::parse("https://www.conation.dev/app/component/doc123").unwrap();
    assert!(matches!(
        plugin.get_destination(&url),
        NavigationOutput::AppLink(_)
    ));
}

#[test]
fn get_destination_external_for_non_app_path_on_conation_host() {
    let plugin = test_plugin();
    for url in ["https://conation.dev/pricing", "https://conation.dev/about"] {
        assert!(
            matches!(
                plugin.get_destination(&Url::parse(url).unwrap()),
                NavigationOutput::External(_)
            ),
            "{url}"
        );
    }
}

#[test]
fn get_destination_external_for_app_path_on_foreign_host() {
    let plugin = test_plugin();
    let url = Url::parse("https://evil.example/app/component/doc123").unwrap();
    assert!(matches!(
        plugin.get_destination(&url),
        NavigationOutput::External(_)
    ));
}

#[test]
fn get_destination_internal_for_spa_origins() {
    let plugin = test_plugin();
    for url in [
        "tauri://localhost/index.html",
        "http://tauri.localhost/index.html",
        "http://localhost:3000/component/abc",
    ] {
        assert!(
            matches!(
                plugin.get_destination(&Url::parse(url).unwrap()),
                NavigationOutput::Internal
            ),
            "{url}"
        );
    }
}

/// If an app-link host is ever (re-)added to the allowlist, `/app` paths must
/// still be routed as app links instead of full-page loading the remote site
/// in the webview — the app-link check runs before the allowlist.
#[test]
fn get_destination_app_link_wins_over_allowlist() {
    let plugin = MacroNavigationPlugin::new(&["https://conation.dev"])
        .unwrap()
        .with_app_link_hosts(&["conation.dev"]);
    let app_url = Url::parse("https://conation.dev/app/component/doc123").unwrap();
    assert!(matches!(
        plugin.get_destination(&app_url),
        NavigationOutput::AppLink(_)
    ));
    let site_url = Url::parse("https://conation.dev/pricing").unwrap();
    assert!(matches!(
        plugin.get_destination(&site_url),
        NavigationOutput::Internal
    ));
}

#[test]
fn get_destination_no_app_link_hosts_keeps_old_behavior() {
    let plugin = MacroNavigationPlugin::new(&["https://conation.dev"]).unwrap();
    let url = Url::parse("https://conation.dev/app/component/doc123").unwrap();
    assert!(matches!(
        plugin.get_destination(&url),
        NavigationOutput::Internal
    ));
}

#[test]
fn from_url_extracts_correct_path_from_universal_link() {
    let url = Url::parse("https://conation.dev/app/component/doc123").unwrap();
    let result = MacroScheme::from_url(&url).unwrap();
    assert_eq!(result.scheme(), "conation");
    assert_eq!(result.path(), "/component/doc123");
    assert_eq!(result.query(), None);
}

#[test]
fn custom_scheme_is_conation_by_default_and_legacy_only_when_explicit() {
    assert!(MacroScheme::new(Url::parse("conation://app/component/doc123").unwrap()).is_ok());
    assert!(MacroScheme::new(Url::parse("macro://app/component/doc123").unwrap()).is_err());
    assert!(
        MacroScheme::new_with_scheme(Url::parse("macro://app/component/doc123").unwrap(), "macro")
            .is_ok()
    );
}

#[test]
fn from_url_extracts_path_and_query_from_universal_link() {
    let url = Url::parse("https://conation.dev/app/component/doc123?foo=bar").unwrap();
    let result = MacroScheme::from_url(&url).unwrap();
    assert_eq!(result.path(), "/component/doc123");
    assert_eq!(result.query(), Some("foo=bar"));
}

#[test]
fn from_url_strips_bare_app_path() {
    let url = Url::parse("https://conation.dev/app").unwrap();
    let result = MacroScheme::from_url(&url).unwrap();
    assert_eq!(result.path(), "/");
}

#[test]
fn from_url_handles_nested_path() {
    let url = Url::parse("https://conation.dev/app/component/nested/path/here").unwrap();
    let result = MacroScheme::from_url(&url).unwrap();
    assert_eq!(result.path(), "/component/nested/path/here");
}

#[test]
fn transform_external_url_adds_is_mobile_when_query_exists() {
    let url = Url::parse("https://example.com/path?foo=bar").unwrap();
    let result = transform_external_url(url);
    assert_eq!(
        result.query_pairs().find(|(k, _)| k == "is_mobile"),
        Some((Cow::Borrowed("is_mobile"), Cow::Borrowed("true")))
    );
}

#[test]
fn transform_external_url_no_query_does_not_add_is_mobile() {
    let url = Url::parse("https://example.com/path").unwrap();
    let result = transform_external_url(url);
    assert_eq!(result.query_pairs().find(|(k, _)| k == "is_mobile"), None);
}

#[test]
fn transform_external_url_preserves_existing_is_mobile_true() {
    let url = Url::parse("https://example.com/path?is_mobile=true").unwrap();
    let result = transform_external_url(url);
    let is_mobile_count = result
        .query_pairs()
        .filter(|(k, _)| k == "is_mobile")
        .count();
    assert_eq!(is_mobile_count, 1);
    assert_eq!(
        result.query_pairs().find(|(k, _)| k == "is_mobile"),
        Some((Cow::Borrowed("is_mobile"), Cow::Borrowed("true")))
    );
}

#[test]
fn transform_external_url_preserves_existing_is_mobile_false() {
    let url = Url::parse("https://example.com/path?is_mobile=false").unwrap();
    let result = transform_external_url(url);
    let is_mobile_count = result
        .query_pairs()
        .filter(|(k, _)| k == "is_mobile")
        .count();
    assert_eq!(is_mobile_count, 1);
    assert_eq!(
        result.query_pairs().find(|(k, _)| k == "is_mobile"),
        Some((Cow::Borrowed("is_mobile"), Cow::Borrowed("false")))
    );
}

#[test]
fn transform_external_url_preserves_other_query_params() {
    let url = Url::parse("https://example.com/path?foo=bar&baz=qux").unwrap();
    let result = transform_external_url(url);
    assert_eq!(
        result.query_pairs().find(|(k, _)| k == "foo"),
        Some((Cow::Borrowed("foo"), Cow::Borrowed("bar")))
    );
    assert_eq!(
        result.query_pairs().find(|(k, _)| k == "baz"),
        Some((Cow::Borrowed("baz"), Cow::Borrowed("qux")))
    );
    assert_eq!(
        result.query_pairs().find(|(k, _)| k == "is_mobile"),
        Some((Cow::Borrowed("is_mobile"), Cow::Borrowed("true")))
    );
}

#[cfg(not(feature = "cef"))]
#[test]
fn default_build_sends_external_urls_to_system_browser() {
    assert_eq!(
        MacroNavigationPlugin::external_navigation_target(),
        ExternalNavigationTarget::SystemDefaultBrowser
    );
}

#[cfg(feature = "cef")]
#[test]
fn cef_feature_sends_external_urls_to_compiled_stub() {
    assert_eq!(
        MacroNavigationPlugin::external_navigation_target(),
        ExternalNavigationTarget::CompiledCefStub
    );
    let plugin = test_plugin();
    let url = Url::parse("https://example.com/login").unwrap();
    assert!(matches!(
        plugin.get_destination(&url),
        NavigationOutput::External(_)
    ));
    let opened = cef_browser::process_host().open(&url);
    assert_eq!(opened.url, url);
    assert!(!cef_browser::process_host().status().linked);
}
