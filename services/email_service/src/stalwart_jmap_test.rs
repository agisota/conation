use super::*;

fn session(username: &str, personal: bool) -> JmapSession {
    serde_json::from_value(serde_json::json!({
        "username": username,
        "primaryAccounts": {"urn:ietf:params:jmap:mail": "mail-1"},
        "accounts": {"mail-1": {
            "isPersonal": personal,
            "accountCapabilities": {"urn:ietf:params:jmap:mail": {}}
        }}
    }))
    .unwrap()
}

#[test]
fn personal_primary_mailbox_matches_exact_principal() {
    assert_eq!(session("alice@example.com", true).primary_mailbox("alice@example.com"), Some("mail-1"));
    assert_eq!(session("other@example.com", true).primary_mailbox("alice@example.com"), None);
    assert_eq!(session("alice@example.com", false).primary_mailbox("alice@example.com"), None);
}

#[test]
fn personal_primary_mailbox_accepts_rfc_session_username_forms_for_authenticated_login() {
    assert_eq!(session("", true).primary_mailbox("alice@example.com"), Some("mail-1"));
    assert_eq!(session("alice", true).primary_mailbox("alice@example.com"), Some("mail-1"));
    assert_eq!(session("other", true).primary_mailbox("alice@example.com"), None);
}

#[test]
fn incomplete_session_does_not_verify_mailbox() {
    let no_mail = serde_json::from_value::<JmapSession>(serde_json::json!({
        "username": "alice@example.com", "primaryAccounts": {}, "accounts": {}
    })).unwrap();
    assert_eq!(no_mail.primary_mailbox("alice@example.com"), None);
}

#[test]
fn endpoint_requires_https_and_no_embedded_credentials() {
    assert!(validate_session_url("https://mail.example.com/.well-known/jmap").is_ok());
    assert!(validate_session_url("http://mail.example.com/.well-known/jmap").is_err());
    assert!(validate_session_url("https://user:password@mail.example.com/.well-known/jmap").is_err());
}
