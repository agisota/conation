use super::*;

fn make_invite() -> InviteToMacro {
    InviteToMacro {
        recipient_email: EmailStr::try_from("recipient@example.com".to_string()).unwrap(),
        referral_code: ReferralCode("ABC123".to_string()),
        sender_profile_picture_url: None,
        sender_name: Some("Test User".to_string()),
        sender_email: Some("sender@example.com".to_string()),
        locale: "ru".to_string(),
    }
}

fn has_cyrillic(text: &str) -> bool {
    text.chars()
        .any(|character| matches!(character, '\u{0400}'..='\u{052f}'))
}

fn make_channel_invite() -> ChannelInviteMetadata {
    ChannelInviteMetadata {
        invited_by: MacroUserIdStr::try_from_email("sender@example.com").unwrap(),
        channel_name: "engineering".to_string(),
        message_content: None,
        sender_profile_picture_url: None,
        locale: "ru".to_string(),
    }
}

fn make_team_invite() -> InviteToTeamMetadata {
    InviteToTeamMetadata {
        team_name: "Platform".to_string(),
        team_id: Uuid::new_v4(),
        team_invite_id: Uuid::new_v4(),
        invited_by: MacroUserIdStr::try_from_email("sender@example.com").unwrap(),
        role: Some("Member".to_string()),
        sender_profile_picture_url: None,
        locale: "ru".to_string(),
    }
}

#[test]
fn referral_url_does_not_panic() {
    let invite = make_invite();
    let _url = invite.referral_url();
}

#[test]
fn get_url_all_environments() {
    let code = ReferralCode("CODE".to_string());
    let cases = [
        (Environment::Production, "conation.dev"),
        (Environment::Develop, "dev.conation.dev"),
        (Environment::Local, "localhost"),
    ];
    for (env, expected_host) in cases {
        let url = get_url(env, &code);
        assert_eq!(url.host_str().unwrap(), expected_host);
        assert!(url.as_str().contains("referral_code=CODE"));
        assert_eq!(url.path(), "/app/signup");
    }
}

#[test]
fn configured_public_origins_preserve_self_host_app_prefix_and_cdn_directory() {
    let urls = resolve_invite_urls(
        Environment::Production,
        Some("https://workspace.example.test/conation"),
        Some("https://assets.example.test/conation-email"),
        None,
    )
    .unwrap();

    assert_eq!(
        urls.referral_url(&ReferralCode("CODE".to_string()))
            .as_str(),
        "https://workspace.example.test/conation/signup?referral_code=CODE"
    );
    assert_eq!(
        urls.team_invite_url(Uuid::nil()).as_str(),
        "https://workspace.example.test/conation/team-invite?id=00000000-0000-0000-0000-000000000000"
    );
    assert_eq!(
        urls.brand_asset_url().as_str(),
        "https://assets.example.test/conation-email/logo192.png"
    );
}

#[test]
fn local_defaults_use_the_browser_facing_app_path() {
    let urls = resolve_invite_urls(Environment::Local, None, None, Some("4010")).unwrap();

    assert_eq!(
        urls.signup_url().as_str(),
        "http://localhost:4010/app/signup"
    );
    assert_eq!(
        urls.brand_asset_url().as_str(),
        "http://localhost:4010/app/logo192.png"
    );
}

#[test]
fn malformed_or_legacy_public_origins_are_rejected_before_rendering() {
    for (app_base_url, asset_base_url) in [
        (Some(""), None),
        (Some("workspace.example.test/app"), None),
        (Some("javascript:alert(1)"), None),
        (Some("https://user@workspace.example.test/app"), None),
        (
            Some("https://workspace.example.test/app?next=attacker"),
            None,
        ),
        (Some("https://workspace.example.test/app#token"), None),
        (Some("https://macro.com/app"), None),
        (Some("https://workspace.example.test/app"), Some("")),
        (
            Some("https://workspace.example.test/app"),
            Some("https://static-file-service.macro.com/assets"),
        ),
    ] {
        assert!(
            resolve_invite_urls(Environment::Production, app_base_url, asset_base_url, None,)
                .is_err(),
            "app={app_base_url:?}, asset={asset_base_url:?}"
        );
    }
}

#[test]
fn format_email_with_sender_name() {
    let invite = make_invite();
    let referral_url = invite.referral_url().to_string();
    let email = invite.format_email();
    assert_eq!(email.subject, "Test User приглашает вас в Conation");
    assert!(
        email.body.contains(&referral_url),
        "email body should contain the referral URL"
    );
    assert!(
        email
            .body
            .contains("приглашает вас присоединиться к Conation")
    );
    assert!(!email.body.contains("Пользователь Conation"));
    assert!(email.body.contains("/logo192.png"));
    assert!(!email.body.contains("macro.com"));
    assert!(has_cyrillic(&email.subject));
    assert!(has_cyrillic(&email.body));
    assert!(email.body.contains("lang=\"ru\""));
}

#[test]
fn format_email_falls_back_to_email_when_no_name() {
    let invite = InviteToMacro {
        sender_name: None,
        ..make_invite()
    };
    let email = invite.format_email();
    assert_eq!(
        email.subject,
        "sender@example.com приглашает вас в Conation"
    );
    assert!(email.body.contains("sender@example.com"));
}

#[test]
fn format_email_falls_back_to_generic_when_no_name_or_email() {
    let invite = InviteToMacro {
        sender_name: None,
        sender_email: None,
        ..make_invite()
    };
    let email = invite.format_email();
    assert_eq!(
        email.subject,
        "Пользователь Conation приглашает вас в Conation"
    );
    assert!(email.body.contains("Пользователь Conation"));
    assert!(has_cyrillic(&email.subject));
    assert!(has_cyrillic(&email.body));
}

#[test]
fn format_email_for_locale_renders_english_without_cloning_russian() {
    let invite = make_invite();
    let email = invite.format_email_for_locale("en");
    assert_eq!(email.subject, "Test User has invited you to join Conation");
    assert!(email.body.contains("has invited you to Conation"));
    assert!(email.body.contains("lang=\"en\""));
    assert!(!has_cyrillic(&email.subject));
    assert!(!has_cyrillic(&email.body));
    assert_eq!(
        invite.format_email().subject,
        "Test User приглашает вас в Conation"
    );
}

#[test]
fn channel_invite_uses_conation_display_copy_and_public_links() {
    let invite = make_channel_invite();
    let email = invite.format_email();

    assert_eq!(
        invite.format_body(None).unwrap(),
        "Откройте Conation, чтобы продолжить"
    );
    assert_eq!(
        email.subject,
        "sender@example.com приглашает вас в #engineering"
    );
    assert!(email.body.contains("в Conation"));
    assert!(email.body.contains("/app/signup"));
    assert!(email.body.contains("/logo192.png"));
    assert!(!email.body.contains("macro.com"));
    assert!(has_cyrillic(&email.subject));
    assert!(has_cyrillic(&email.body));

    let english = invite.format_email_for_locale("en");
    assert_eq!(
        english.subject,
        "sender@example.com has invited you to join #engineering"
    );
    assert!(english.body.contains("on Conation"));
    assert!(!has_cyrillic(&english.subject));
}

#[test]
fn team_invite_subject_and_body_use_conation_display_name() {
    let invite = make_team_invite();
    let email = invite.format_email();

    assert_eq!(
        email.subject,
        "sender@example.com приглашает вас в команду Platform в Conation"
    );
    assert!(
        email
            .body
            .contains("команду <strong>Platform</strong> в Conation")
    );
    assert!(email.body.contains("/app/team-invite?id="));
    assert!(email.body.contains("/logo192.png"));
    assert!(!email.body.contains("macro.com"));
    assert!(has_cyrillic(&email.subject));
    assert!(has_cyrillic(&email.body));

    let english = invite.format_email_for_locale("en");
    assert_eq!(
        english.subject,
        "sender@example.com has invited you to the Platform team on Conation"
    );
    assert!(english.body.contains("Platform</strong> team on Conation"));
    assert!(!has_cyrillic(&english.subject));
}

#[test]
fn rate_limit_config_does_not_panic() {
    let config = InviteToMacro::rate_limit_config();
    assert_eq!(config.max_count, 1);
    assert_eq!(config.window, Duration::from_mins(MINUTES_PER_WEEK));
}

#[test]
fn rate_limit_key_does_not_panic() {
    let invite = make_invite();
    let _key = invite.rate_limit_key();
}

#[test]
fn serialization_roundtrip() {
    let invite = make_invite();
    let json = serde_json::to_string(&invite).unwrap();
    let deserialized: InviteToMacro = serde_json::from_str(&json).unwrap();
    assert_eq!(deserialized.referral_code.0, "ABC123");
}

#[test]
fn deserialization_without_sender_email_uses_none() {
    let json = r#"{
        "recipient_email": "recipient@example.com",
        "referral_code": "ABC123",
        "sender_profile_picture_url": null,
        "sender_name": "Test User"
    }"#;
    let deserialized: InviteToMacro = serde_json::from_str(json).unwrap();
    assert!(deserialized.sender_email.is_none());
}
