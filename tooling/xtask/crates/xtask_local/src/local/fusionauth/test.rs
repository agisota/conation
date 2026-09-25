use super::*;

fn auth_env(secret: &str) -> BTreeMap<String, String> {
    [
        ("INTERNAL_API_SECRET_KEY", secret),
        ("INTERNAL_API_KEY", secret),
        ("INTERNAL_AUTH_KEY", secret),
        ("AUTHENTICATION_SERVICE_SECRET_KEY", secret),
    ]
    .into_iter()
    .map(|(key, value)| (key.to_string(), value.to_string()))
    .collect()
}

#[test]
fn resolved_auth_key_requires_all_service_aliases_to_match() {
    let env = auth_env("resolved-local-key");
    assert_eq!(
        resolved_internal_auth_key(&env).unwrap(),
        "resolved-local-key"
    );

    let mut mismatched = env.clone();
    mismatched.insert("INTERNAL_AUTH_KEY".into(), "old-local-key".into());
    let error = resolved_internal_auth_key(&mismatched).unwrap_err();
    assert!(error.to_string().contains("INTERNAL_AUTH_KEY"));

    let mut missing = env;
    missing.remove("AUTHENTICATION_SERVICE_SECRET_KEY");
    let error = resolved_internal_auth_key(&missing).unwrap_err();
    assert!(
        error
            .to_string()
            .contains("AUTHENTICATION_SERVICE_SECRET_KEY")
    );

    let mut empty = auth_env(" ");
    let error = resolved_internal_auth_key(&empty).unwrap_err();
    assert!(error.to_string().contains("missing or empty"));

    empty.remove("INTERNAL_API_SECRET_KEY");
    let error = resolved_internal_auth_key(&empty).unwrap_err();
    assert!(error.to_string().contains("INTERNAL_API_SECRET_KEY"));
}

#[test]
fn update_guard_rejects_a_key_different_from_the_initialized_fingerprint() {
    let original = auth_env("old-local-key");
    let fingerprint = auth_key_fingerprint(&original).unwrap();
    ensure_auth_key_fingerprint_matches(Some(&fingerprint), &original).unwrap();

    let rotated = auth_env("new-local-key");
    let error =
        ensure_auth_key_fingerprint_matches(Some(&fingerprint), &rotated).unwrap_err();
    assert!(error.to_string().contains("run `stack up` to reinitialize"));

    let error = ensure_auth_key_fingerprint_matches(None, &rotated).unwrap_err();
    assert!(error.to_string().contains("no initialized auth-key fingerprint"));
}

#[test]
fn app_secrets_json_is_authoritative_for_the_auth_webhook_key() {
    let mut env = auth_env("flat-key");
    env.insert(
        "APP_SECRETS_JSON".into(),
        r#"{"INTERNAL_API_SECRET_KEY":"json-key","INTERNAL_API_KEY":"json-key","INTERNAL_AUTH_KEY":"json-key","AUTHENTICATION_SERVICE_SECRET_KEY":"json-key"}"#.into(),
    );

    let key = resolved_internal_auth_key(&env).unwrap();
    assert_eq!(key, "json-key");

    let doc = kickstart::build_with_internal_auth_key(
        3000,
        8080,
        8085,
        "function populate() {}",
        "function reconcile() {}",
        &key,
        None,
        None,
    );
    let webhooks: Vec<_> = doc["requests"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|request| request["url"] == "/api/webhook")
        .collect();
    assert_eq!(webhooks.len(), 2);
    assert!(
        webhooks.iter().all(|request| {
            request["body"]["webhook"]["headers"]["x-internal-auth-key"] == "json-key"
        })
    );

}

#[test]
fn app_secrets_json_missing_alias_does_not_fall_back_to_flat_environment() {
    let mut env = auth_env("flat-key");
    env.insert(
        "APP_SECRETS_JSON".into(),
        r#"{"INTERNAL_API_SECRET_KEY":"json-key","INTERNAL_API_KEY":"json-key","INTERNAL_AUTH_KEY":"json-key"}"#.into(),
    );

    let error = resolved_internal_auth_key(&env).unwrap_err();
    assert!(error.to_string().contains("AUTHENTICATION_SERVICE_SECRET_KEY"));
}

#[test]
fn app_secrets_json_alias_mismatch_fails_even_when_flat_aliases_match() {
    let mut env = auth_env("flat-key");
    env.insert(
        "APP_SECRETS_JSON".into(),
        r#"{"INTERNAL_API_SECRET_KEY":"json-key","INTERNAL_API_KEY":"json-key","INTERNAL_AUTH_KEY":"different-json-key","AUTHENTICATION_SERVICE_SECRET_KEY":"json-key"}"#.into(),
    );

    let error = resolved_internal_auth_key(&env).unwrap_err();
    assert!(error.to_string().contains("INTERNAL_AUTH_KEY"));
}

#[test]
fn auth_webhook_key_rejects_invalid_http_header_bytes() {
    let env = auth_env("bad\r\nx-internal-auth-key: injected");
    let error = resolved_internal_auth_key(&env).unwrap_err();
    assert!(error.to_string().contains("valid HTTP header value"));
}

#[test]
fn invalid_app_secrets_json_fails_without_echoing_its_contents() {
    let mut env = auth_env("flat-key");
    let invalid = "{private-json-content-is-not-reported";
    env.insert("APP_SECRETS_JSON".into(), invalid.into());

    let error = resolved_internal_auth_key(&env).unwrap_err();
    assert!(error.to_string().contains("APP_SECRETS_JSON"));
    assert!(!error.to_string().contains(invalid));
}
