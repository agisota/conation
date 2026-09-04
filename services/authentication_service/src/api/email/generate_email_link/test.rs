use axum::http::{HeaderValue, header::ACCEPT_LANGUAGE};

use super::*;

#[test]
fn selects_russian_from_the_request_headers() {
    let mut headers = HeaderMap::new();
    headers.insert(
        ACCEPT_LANGUAGE,
        HeaderValue::from_static("de;q=0.8, ru-RU;q=0.9, en;q=0.7"),
    );

    assert_eq!(requested_locale(&headers), SupportedLocale::Russian);
}

#[test]
fn combines_repeated_accept_language_fields() {
    let mut headers = HeaderMap::new();
    headers.append(ACCEPT_LANGUAGE, HeaderValue::from_static("en;q=0.5"));
    headers.append(ACCEPT_LANGUAGE, HeaderValue::from_static("ru;q=0.9"));

    assert_eq!(requested_locale(&headers), SupportedLocale::Russian);
}

#[test]
fn falls_back_to_russian_for_an_invalid_header_value() {
    let mut headers = HeaderMap::new();
    headers.insert(
        ACCEPT_LANGUAGE,
        HeaderValue::from_bytes(&[0xff]).expect("opaque header bytes are permitted"),
    );

    assert_eq!(requested_locale(&headers), SupportedLocale::Russian);
}

#[test]
fn falls_back_to_russian_for_missing_or_unsupported_language() {
    assert_eq!(
        requested_locale(&HeaderMap::new()),
        SupportedLocale::Russian
    );

    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("fr-CA, fr;q=0.9"));

    assert_eq!(requested_locale(&headers), SupportedLocale::Russian);
}

#[test]
fn builds_a_deployment_relative_localized_verification_email() {
    let verification_id = Uuid::parse_str("018f1f61-7b2e-7ee1-bd5d-d18ebaeac73a").unwrap();
    let rendered = verification_email_for_delivery(
        "https://self-hosted.example.test/auth/",
        verification_id,
        SupportedLocale::Russian,
        "help@self-hosted.example.test",
    )
    .unwrap();

    assert_eq!(rendered.subject(), "Подтвердите адрес электронной почты");
    assert!(rendered.html().contains(&format!(
        "https://self-hosted.example.test/auth/email/verify/{verification_id}"
    )));
    assert!(rendered.html().contains("lang=\"ru\""));
    assert!(
        rendered
            .html()
            .contains("mailto:help@self-hosted.example.test")
    );
}

#[test]
fn rejects_a_non_url_base() {
    let verification_id = Uuid::nil();

    assert!(
        verification_email_for_delivery(
            "not a URL",
            verification_id,
            SupportedLocale::English,
            "pythia@conation.dev",
        )
        .is_err()
    );
}
