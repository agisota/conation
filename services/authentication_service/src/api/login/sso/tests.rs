use axum::{
    body::Body,
    extract::{FromRequest, Request},
};
use cool_asserts::assert_matches;

use super::*;

#[test]
fn allowed_original_urls_are_accepted() {
    for original_url in [
        "conation://login",
        "conation:///welcome",
        "conation:///otherthing",
        "conation://otherthing/path",
        "tauri://localhost/app/login",
        "http://tauri.localhost/app/login",
        "https://tauri.localhost/app/login",
        "https://localhost/app/login",
        "http://localhost:3000/app/login",
        "https://dev.conation.dev/app/login",
        "https://conation.dev/app/login",
    ] {
        let original_url = Url::parse(original_url).expect("test URL should parse");
        assert!(
            is_allowed_original_url(&original_url),
            "{original_url} should be allowed"
        );
    }
}

#[test]
fn untrusted_original_urls_are_rejected() {
    for original_url in [
        "https://example.com/app/login",
        "macro://login",
        "https://macro.com/app/login",
        "https://macro.com.example.com/app/login",
        "https://staging.macro.com/app/login",
        "http://macro.com/app/login",
        "http://dev.macro.com/app/login",
        "tauri://example.com/app/login",
        "http://127.0.0.1:3000/app/login",
        "javascript:alert('redirected')",
    ] {
        let original_url = Url::parse(original_url).expect("test URL should parse");
        assert!(
            !is_allowed_original_url(&original_url),
            "{original_url} should be rejected"
        );
    }
}

#[test]
fn custom_app_origin_is_allowed_exactly() {
    let app_origin = "https://workspace.example.org";
    let allowed_origins = vec![app_origin.to_owned()];
    let trusted = Url::parse("https://workspace.example.org/app/login").unwrap();
    let lookalike = Url::parse("https://workspace.example.org.attacker.test/app/login").unwrap();

    assert!(is_allowed_original_url_with(
        &trusted,
        app_origin,
        &allowed_origins
    ));
    assert!(!is_allowed_original_url_with(
        &lookalike,
        app_origin,
        &allowed_origins
    ));
}

#[test]
fn original_urls_with_userinfo_are_rejected() {
    let app_origin = "https://conation.dev";
    let allowed_origins = vec![app_origin.to_owned()];
    let url = Url::parse("https://attacker@conation.dev/app/login").unwrap();

    assert!(!is_allowed_original_url_with(
        &url,
        app_origin,
        &allowed_origins
    ));
}

#[test]
fn redacted_url_strips_credentials_query_and_fragment_but_keeps_path() {
    let url =
        Url::parse("https://alice:secret@evil.example.com/app/login?token=abc123#access_token=xyz")
            .expect("test URL should parse");
    let redacted = redact_original_url_for_logging(&url);
    assert_eq!(redacted.as_str(), "https://evil.example.com/app/login");
}

#[test]
fn redacted_url_handles_cannot_be_a_base_urls() {
    let url = Url::parse("mailto:alice@example.com?subject=hi").expect("test URL should parse");
    let redacted = redact_original_url_for_logging(&url);
    assert_eq!(redacted.as_str(), "mailto:alice@example.com");
}

#[tokio::test]
async fn it_works_with_no_params() {
    let request = Request::builder()
        .uri("https://example.com")
        .body(Body::from(()))
        .unwrap();

    let extracted = Query::<LoginQueryParams>::from_request(request, &())
        .await
        .expect("it should extract");

    assert_matches!(
        extracted,
        Query(LoginQueryParams {
            idp_name: None,
            idp_id: None,
            login_hint: None,
            original_url: None,
            is_mobile: false,
            referral_code: None,
        })
    );
}

#[tokio::test]
async fn it_works_with_mobile() {
    let request = Request::builder()
        .uri("https://example.com?is_mobile=true")
        .body(Body::from(()))
        .unwrap();

    let extracted = Query::<LoginQueryParams>::from_request(request, &())
        .await
        .expect("it should extract");

    assert_matches!(
        extracted,
        Query(LoginQueryParams {
            idp_name: None,
            idp_id: None,
            login_hint: None,
            original_url: None,
            is_mobile: true,
            referral_code: None,
        })
    );
}

#[tokio::test]
async fn it_works_with_mobile_false() {
    let request = Request::builder()
        .uri("https://example.com?is_mobile=false")
        .body(Body::from(()))
        .unwrap();

    let extracted = Query::<LoginQueryParams>::from_request(request, &())
        .await
        .expect("it should extract");

    assert_matches!(
        extracted,
        Query(LoginQueryParams {
            idp_name: None,
            idp_id: None,
            login_hint: None,
            original_url: None,
            is_mobile: false,

            referral_code: None,
        })
    );
}

#[tokio::test]
async fn it_fails_with_mobile_garbage() {
    let request = Request::builder()
        .uri("https://example.com?is_mobile=garbage")
        .body(Body::from(()))
        .unwrap();
    let _rejection = Query::<LoginQueryParams>::from_request(request, &())
        .await
        .unwrap_err();
}

#[tokio::test]
async fn it_works_with_everything() {
    let request = Request::builder().uri("https://example.com?is_mobile=true&idp_name=testing&referral_code=code&idp_id=something&login_hint=myhint&original_url=https%3A%2F%2Fexample.com").body(Body::from(())).unwrap();

    let extracted = Query::<LoginQueryParams>::from_request(request, &())
        .await
        .expect("it should extract");

    assert_matches!(extracted, Query(LoginQueryParams {
       idp_name: Some(idp_name),
       idp_id: Some(idp_id),
       login_hint: Some(login_hint),
       original_url: Some(original_url),
       is_mobile: true,
        referral_code: Some(code),
    }) => {
        assert_eq!(idp_name, "testing");
        assert_eq!(idp_id, "something");
        assert_eq!(login_hint, "myhint");
        assert_eq!(original_url.0.as_str(), "https://example.com/");
        assert_eq!(code, "code");
    });
}

#[tokio::test]
async fn it_works_with_conation_scheme() {
    let request = Request::builder().uri("https://example.com/login/sso?original_url=conation%3A%2F%2Flogin&idp_name=google&is_mobile=true").body(Body::from(())).unwrap();

    let extracted = Query::<LoginQueryParams>::from_request(request, &())
        .await
        .expect("it should extract");

    assert_matches!(extracted, Query(LoginQueryParams {
       idp_name: Some(idp_name),
       idp_id: None,
       login_hint: None,
       original_url: Some(original_url),
       is_mobile: true,
       referral_code: _
    }) => {
        assert_eq!(idp_name, "google");
        assert_eq!(original_url.0.as_str(), "conation://login");
    });
}

#[tokio::test]
async fn it_works_with_double_encoded_scheme() {
    let request = Request::builder().uri("https://example.com/login/sso?original_url=https%253A%252F%252Fexample.com&idp_name=google&is_mobile=true").body(Body::from(())).unwrap();

    let extracted = Query::<LoginQueryParams>::from_request(request, &())
        .await
        .expect("it should extract");

    assert_matches!(extracted, Query(LoginQueryParams {
       idp_name: Some(idp_name),
       idp_id: None,
       login_hint: None,
       original_url: Some(original_url),
       is_mobile: true,
       referral_code: _
    }) => {
        assert_eq!(idp_name, "google");
        assert_eq!(original_url.0.as_str(), "https://example.com/");
    });
}
