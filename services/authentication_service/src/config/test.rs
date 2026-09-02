use super::*;

#[test]
fn public_urls_accept_conation_and_custom_operator_hosts() {
    for (base_url, public_url) in [
        ("https://auth.conation.dev", "https://login.conation.dev"),
        (
            "https://auth.workspace.example.org",
            "https://identity.workspace.example.org",
        ),
        ("http://localhost:8080", "http://localhost:9011"),
    ] {
        validate_public_url_config(
            base_url,
            &format!("{base_url}/oauth/redirect"),
            Some(public_url),
        )
        .unwrap();
    }
}

#[test]
fn public_urls_reject_mismatched_callbacks_and_malformed_hosts() {
    assert!(
        validate_public_url_config(
            "https://auth.conation.dev",
            "https://attacker.example/oauth/redirect",
            None,
        )
        .is_err()
    );

    for base_url in [
        "auth.conation.dev",
        "javascript:alert(1)",
        "https://user@auth.conation.dev",
        "https://auth.conation.dev?next=attacker",
    ] {
        assert!(
            validate_public_url_config(base_url, "https://auth.conation.dev/oauth/redirect", None,)
                .is_err(),
            "{base_url}"
        );
    }
}

#[test]
fn mail_identity_uses_conation_defaults() {
    assert_eq!(
        resolve_mail_identity(None, None).unwrap(),
        MailIdentity {
            auth_sender_email: "auth@conation.dev".to_owned(),
            support_email: "pythia@conation.dev".to_owned(),
        }
    );
}

#[test]
fn mail_identity_accepts_operator_owned_addresses() {
    assert_eq!(
        resolve_mail_identity(
            Some("MAILER@WORKSPACE.EXAMPLE"),
            Some("HELP@WORKSPACE.EXAMPLE"),
        )
        .unwrap(),
        MailIdentity {
            auth_sender_email: "mailer@workspace.example".to_owned(),
            support_email: "help@workspace.example".to_owned(),
        }
    );
}

#[test]
fn mail_identity_rejects_blank_or_malformed_addresses() {
    for (sender, support) in [
        (Some(""), None),
        (Some("not-an-email"), None),
        (None, Some(" \t ")),
        (None, Some("help@localhost")),
    ] {
        assert!(resolve_mail_identity(sender, support).is_err());
    }
}

#[test]
fn complete_microsoft_credentials_are_resolved() {
    let credentials = resolve(
        Some("microsoft-client-id"),
        Some("microsoft-client-secret"),
        Some("microsoft-tenant-id"),
    )
    .expect("complete credentials should be valid");
    let Some(credentials) = credentials else {
        panic!("complete credentials should enable Microsoft OAuth");
    };

    assert_eq!(credentials.client_id, "microsoft-client-id");
    assert_eq!(credentials.client_secret, "microsoft-client-secret");
    assert_eq!(credentials.tenant_id, "microsoft-tenant-id");
    assert_eq!(credentials.token_kms_key_id, "microsoft-kms-key");
}

#[test]
fn absent_or_blank_microsoft_credentials_are_disabled() {
    let missing_values = [None, Some(""), Some(" \t ")];

    for client_id in missing_values {
        for client_secret in missing_values {
            for tenant_id in missing_values {
                let credentials = resolve(client_id, client_secret, tenant_id)
                    .expect("absent or blank credentials should be valid");
                assert!(credentials.is_none());
            }
        }
    }
}

#[test]
fn absent_google_and_stripe_credentials_disable_integrations() {
    assert!(resolve_google_credentials(None, None).unwrap().is_none());
    assert!(resolve_stripe_credentials(None, None).unwrap().is_none());
}

#[test]
fn complete_google_and_stripe_credentials_enable_integrations() {
    let google = resolve_google_credentials(Some("google-client"), Some("GOCSPX-google-secret"))
        .unwrap()
        .expect("Google credentials should be enabled");
    assert_eq!(google.client_id, "google-client");
    assert_eq!(google.client_secret, "GOCSPX-google-secret");

    let stripe = resolve_stripe_credentials(Some("stripe-secret"), Some("price-free"))
        .unwrap()
        .expect("Stripe credentials should be enabled");
    assert_eq!(stripe.secret_key, "stripe-secret");
    assert_eq!(stripe.price_id, "price-free");
}

#[test]
fn local_placeholder_stripe_credentials_disable_billing() {
    let credentials = resolve_stripe_credentials(Some("local-stripe-secret"), Some("price-free"))
        .unwrap()
        .expect("the pair is syntactically complete");

    assert!(!stripe_billing_is_enabled_for_environment(
        Environment::Local,
        &credentials
    ));
    assert!(stripe_billing_is_enabled_for_environment(
        Environment::Local,
        &StripeCredentials {
            secret_key: "sk_test_real_key".to_owned(),
            price_id: "price-free".to_owned(),
        }
    ));
}

#[test]
fn google_secret_name_placeholder_disables_oauth() {
    let credentials =
        resolve_google_credentials(Some("google-client"), Some("google-client-secret-dev"))
            .expect("a complete placeholder pair is a disabled integration");

    assert!(credentials.is_none());
}

#[test]
fn partial_google_or_stripe_credentials_are_rejected() {
    assert!(resolve_google_credentials(Some("google-client"), None).is_err());
    assert!(resolve_google_credentials(None, Some("google-secret")).is_err());
    assert!(resolve_stripe_credentials(Some("stripe-secret"), None).is_err());
    assert!(resolve_stripe_credentials(None, Some("price-free")).is_err());
}

#[test]
fn every_partial_microsoft_credential_combination_is_rejected() {
    for configured_fields in 1_u8..=6 {
        let client_id = (configured_fields & 0b001 != 0).then_some("microsoft-client-id");
        let client_secret = (configured_fields & 0b010 != 0).then_some("microsoft-client-secret");
        let tenant_id = (configured_fields & 0b100 != 0).then_some("microsoft-tenant-id");

        let error = resolve(client_id, client_secret, tenant_id)
            .err()
            .expect("partial credentials should be rejected");

        assert!(error.to_string().contains("must all be set"));
    }
}

#[test]
fn kms_key_is_required_when_microsoft_oauth_is_enabled() {
    for kms_key_id in [None, Some(""), Some(" \t ")] {
        let error = resolve_with_kms(
            Some("microsoft-client-id"),
            Some("microsoft-client-secret"),
            Some("microsoft-tenant-id"),
            kms_key_id,
        )
        .err()
        .expect("a KMS key is required with Microsoft credentials");

        assert!(error.to_string().contains("MICROSOFT_TOKEN_KMS_KEY_ID"));
    }
}

#[test]
fn kms_key_alone_does_not_enable_microsoft_oauth() {
    let credentials = resolve_with_kms(None, None, None, Some("microsoft-kms-key"))
        .expect("an unused KMS key should not enable Microsoft OAuth");

    assert!(credentials.is_none());
}

#[test]
fn blank_values_are_rejected_when_other_credentials_are_configured() {
    let partial_credentials = [
        (Some(" "), Some("client-secret"), Some("tenant-id")),
        (Some("client-id"), Some(" "), Some("tenant-id")),
        (Some("client-id"), Some("client-secret"), Some(" ")),
    ];

    for (client_id, client_secret, tenant_id) in partial_credentials {
        assert!(resolve(client_id, client_secret, tenant_id).is_err());
    }
}

fn resolve(
    client_id: Option<&'static str>,
    client_secret: Option<&'static str>,
    tenant_id: Option<&'static str>,
) -> anyhow::Result<Option<MicrosoftCredentials>> {
    resolve_with_kms(
        client_id,
        client_secret,
        tenant_id,
        Some("microsoft-kms-key"),
    )
}

fn resolve_with_kms(
    client_id: Option<&'static str>,
    client_secret: Option<&'static str>,
    tenant_id: Option<&'static str>,
    token_kms_key_id: Option<&'static str>,
) -> anyhow::Result<Option<MicrosoftCredentials>> {
    resolve_microsoft_credentials(
        &microsoft_client_id(client_id),
        &microsoft_client_secret(client_secret),
        &microsoft_tenant_id(tenant_id),
        &microsoft_token_kms_key_id(token_kms_key_id),
    )
}

fn microsoft_client_id(value: Option<&'static str>) -> MicrosoftClientId {
    match value {
        Some(value) => MicrosoftClientId::new_testing(value),
        None => MicrosoftClientId::new_unset(),
    }
}

fn microsoft_client_secret(value: Option<&'static str>) -> MicrosoftClientSecret {
    match value {
        Some(value) => MicrosoftClientSecret::new_testing(value),
        None => MicrosoftClientSecret::new_unset(),
    }
}

fn microsoft_tenant_id(value: Option<&'static str>) -> MicrosoftTenantId {
    match value {
        Some(value) => MicrosoftTenantId::new_testing(value),
        None => MicrosoftTenantId::new_unset(),
    }
}

fn microsoft_token_kms_key_id(value: Option<&'static str>) -> MicrosoftTokenKmsKeyId {
    match value {
        Some(value) => MicrosoftTokenKmsKeyId::new_testing(value),
        None => MicrosoftTokenKmsKeyId::new_unset(),
    }
}

#[test]
fn cursor_kms_key_from_config_field() {
    let configured = CursorApiKeyKmsKeyId::new_testing("arn:aws:kms:from-config");
    assert_eq!(
        resolve_cursor_api_key_kms_key_id(&configured, None).unwrap(),
        "arn:aws:kms:from-config"
    );
}

#[test]
fn cursor_kms_key_from_process_env_when_config_unset() {
    let configured = CursorApiKeyKmsKeyId::new_unset();
    assert_eq!(
        resolve_cursor_api_key_kms_key_id(&configured, Some("arn:aws:kms:from-env")).unwrap(),
        "arn:aws:kms:from-env"
    );
}

#[test]
fn cursor_kms_key_prefers_config_over_process_env() {
    let configured = CursorApiKeyKmsKeyId::new_testing("arn:aws:kms:from-config");
    assert_eq!(
        resolve_cursor_api_key_kms_key_id(&configured, Some("arn:aws:kms:from-env")).unwrap(),
        "arn:aws:kms:from-config"
    );
}

#[test]
fn cursor_kms_key_blank_config_falls_back_to_process_env() {
    let configured = CursorApiKeyKmsKeyId::new_testing("  ");
    assert_eq!(
        resolve_cursor_api_key_kms_key_id(&configured, Some("arn:aws:kms:from-env")).unwrap(),
        "arn:aws:kms:from-env"
    );
}

#[test]
fn cursor_kms_key_required_when_both_absent() {
    let configured = CursorApiKeyKmsKeyId::new_unset();
    let error = resolve_cursor_api_key_kms_key_id(&configured, None).unwrap_err();
    assert!(error.to_string().contains("CURSOR_API_KEY_KMS_KEY_ID"));
}
