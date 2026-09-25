use super::*;

#[test]
fn success_statuses_are_provisioned() {
    assert_eq!(
        classify_init_status(StatusCode::OK),
        Some(FirstInboxProvisionOutcome::Provisioned)
    );
    assert_eq!(
        classify_init_status(StatusCode::CREATED),
        Some(FirstInboxProvisionOutcome::Provisioned)
    );
}

#[test]
fn only_existing_inbox_is_skipped() {
    assert_eq!(
        classify_init_response(
            StatusCode::BAD_REQUEST,
            br#"{"code":"ALREADY_INITIALIZED","message":"already initialized"}"#
        ),
        Some(FirstInboxProvisionOutcome::Skipped)
    );
    assert_eq!(
        classify_init_response(
            StatusCode::BAD_REQUEST,
            br#"{"code":"NO_GMAIL_GRANT","message":"no grant"}"#
        ),
        None
    );
    assert_eq!(
        classify_init_response(StatusCode::BAD_REQUEST, br#"{"code":"BAD_REQUEST"}"#),
        None
    );
    assert_eq!(classify_init_response(StatusCode::BAD_REQUEST, b""), None);
}

#[test]
fn other_statuses_are_errors() {
    for status in [
        StatusCode::UNAUTHORIZED,
        StatusCode::CONFLICT,
        StatusCode::TOO_MANY_REQUESTS,
        StatusCode::INTERNAL_SERVER_ERROR,
    ] {
        assert_eq!(classify_init_status(status), None);
    }
}
