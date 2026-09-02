use axum::{
    extract::FromRequestParts,
    http::{Request, StatusCode},
};
use conation_env::Environment;

use super::{AccessTokenCookieExtractor, RefreshTokenHeaderExtractor};
use crate::constant::{CONATION_ACCESS_TOKEN_COOKIE, CONATION_REFRESH_TOKEN_HEADER};

fn environment_cookie_name(base_name: &str) -> String {
    match Environment::new_or_prod() {
        Environment::Production => base_name.to_owned(),
        Environment::Develop => format!("dev-{base_name}"),
        Environment::Local => format!("local-{base_name}"),
    }
}

#[tokio::test]
async fn access_cookie_extractor_accepts_only_the_conation_cookie_name() {
    let cookie_name = environment_cookie_name(CONATION_ACCESS_TOKEN_COOKIE);
    let (mut parts, _) = Request::builder()
        .uri("/")
        .header("cookie", format!("{cookie_name}=fresh-session"))
        .body(())
        .expect("valid request")
        .into_parts();

    let extracted = AccessTokenCookieExtractor::from_request_parts(&mut parts, &())
        .await
        .expect("the Conation cookie is accepted");
    assert_eq!(extracted.0.value(), "fresh-session");

    let legacy_cookie_name = environment_cookie_name("macro-access-token");
    let (mut parts, _) = Request::builder()
        .uri("/")
        .header("cookie", format!("{legacy_cookie_name}=legacy-session"))
        .body(())
        .expect("valid request")
        .into_parts();

    assert!(matches!(
        AccessTokenCookieExtractor::from_request_parts(&mut parts, &()).await,
        Err(StatusCode::UNAUTHORIZED)
    ));
}

#[tokio::test]
async fn refresh_header_extractor_accepts_only_the_conation_header_name() {
    let (mut parts, _) = Request::builder()
        .uri("/")
        .header(CONATION_REFRESH_TOKEN_HEADER, "fresh-refresh-token")
        .body(())
        .expect("valid request")
        .into_parts();

    let extracted = RefreshTokenHeaderExtractor::from_request_parts(&mut parts, &())
        .await
        .expect("the Conation refresh header is accepted");
    assert_eq!(extracted.0, "fresh-refresh-token");

    let (mut parts, _) = Request::builder()
        .uri("/")
        .header("x-macro-refresh-token", "legacy-refresh-token")
        .body(())
        .expect("valid request")
        .into_parts();

    assert!(matches!(
        RefreshTokenHeaderExtractor::from_request_parts(&mut parts, &()).await,
        Err(StatusCode::BAD_REQUEST)
    ));
}
