use super::*;

#[test]
fn local_identity_uses_the_conation_namespace() {
    assert_eq!(ISSUER, "local.conation.dev");
    assert_eq!(MAIL_FROM, "noreply@conation.local");
    assert!(!ISSUER.contains("macro"));
    assert!(!MAIL_FROM.contains("macro"));
}

#[test]
fn oauth_redirect_uri_uses_the_instance_auth_port() {
    assert_eq!(
        oauth_redirect_uri(8_121),
        "http://localhost:8121/oauth/redirect"
    );
}
