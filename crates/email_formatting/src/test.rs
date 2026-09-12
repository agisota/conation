use super::*;
use hmac::Mac;

fn has_cyrillic(text: &str) -> bool {
    text.chars()
        .any(|character| matches!(character, '\u{0400}'..='\u{052f}'))
}

fn digest_urls() -> DigestEmailUrls {
    DigestEmailUrls::new(
        "https://workspace.example.test/app"
            .parse()
            .expect("test app URL must be valid"),
        "https://assets.example.test/conation/logo192.png"
            .parse()
            .expect("test brand asset URL must be valid"),
        "https://workspace.example.test/notification"
            .parse()
            .expect("test notification URL must be valid"),
    )
    .expect("test digest URLs must be accepted")
}

fn render_digest(total_count: usize, num_truncated: usize) -> String {
    let unsubscribe_url = SignedUrl::new(
        "https://workspace.example.test/notification/preferences/disable"
            .parse()
            .expect("test URL must be valid"),
        Hmac::<Sha256>::new_from_slice(b"email-formatting-test-key")
            .expect("HMAC accepts test key"),
    );

    let urls = digest_urls();
    DigestTemplate {
        notifs: vec![NotifPreview {
            created_at: Utc::now(),
            title: "A document was shared with you".to_string(),
            body: "Review the document when you have a moment.".to_string(),
        }],
        num_truncated,
        heading: format!("У вас {}", notification_phrase(total_count)),
        truncated_summary: format!("Ещё {num_truncated} {}", notification_noun(num_truncated)),
        app_url: urls.app_url,
        brand_asset_url: urls.brand_asset_url,
        unsubscribe_url,
    }
    .render()
    .expect("digest template should render")
}

#[test]
fn singular_digest_uses_russian_conation_copy_and_operator_urls() {
    let body = render_digest(1, 0);

    assert_eq!(
        digest_subject(1, "ru"),
        "У вас 1 новое уведомление в Conation"
    );
    assert!(body.contains("У вас 1 новое уведомление"));
    assert!(body.contains("Открыть Conation"));
    assert!(body.contains("Отписаться от дайджестов"));
    assert!(body.contains("https://workspace.example.test/app"));
    assert!(body.contains("https://assets.example.test/conation/logo192.png"));
    assert!(!body.contains("macro.com"));
    assert!(has_cyrillic(&body));
}

#[test]
fn many_digest_uses_russian_plural_forms() {
    let body = render_digest(17, 2);

    assert_eq!(
        digest_subject(17, "ru"),
        "У вас 17 новых уведомлений в Conation"
    );
    assert!(body.contains("У вас 17 новых уведомлений"));
    assert!(body.contains("Ещё 2 уведомления"));
    assert!(has_cyrillic(&body));
}

#[test]
fn digest_url_configuration_rejects_legacy_and_malformed_public_origins() {
    let asset_url: Url = "https://assets.example.test/logo192.png".parse().unwrap();
    let notification_url: Url = "https://workspace.example.test/notification"
        .parse()
        .unwrap();

    for app_url in [
        "https://macro.com/app",
        "https://notifications.macro.com",
        "javascript:alert(1)",
        "https://user@workspace.example.test/app",
        "https://workspace.example.test/app?next=attacker",
    ] {
        assert!(
            DigestEmailUrls::new(
                app_url.parse().unwrap(),
                asset_url.clone(),
                notification_url.clone()
            )
            .is_err(),
            "app URL {app_url:?} must be rejected"
        );
    }

    assert!(
        DigestEmailUrls::new(
            "https://workspace.example.test/app".parse().unwrap(),
            asset_url,
            "https://notifications.macro.com".parse().unwrap(),
        )
        .is_err()
    );
}

#[test]
fn english_digest_copy_does_not_reuse_russian_plural_forms() {
    assert_eq!(
        digest_subject(1, "en"),
        "You have 1 new notification in Conation"
    );
    assert_eq!(
        digest_subject(17, "en"),
        "You have 17 new notifications in Conation"
    );
    assert_eq!(digest_heading(2, "en"), "You have 2 new notifications");
    assert_eq!(digest_truncated_summary(1, "en"), "1 more notification");
    assert!(!has_cyrillic(&digest_subject(3, "en")));
}

#[test]
fn digest_unsubscribe_url_preserves_notification_path_prefix() {
    let urls = digest_urls();
    let signed = urls.unsubscribe_url(
        "email_digest",
        "conation|user@example.com",
        Hmac::<Sha256>::new_from_slice(b"email-formatting-test-key")
            .expect("HMAC accepts test key"),
    );

    assert_eq!(
        signed.as_ref().path(),
        "/notification/user_notifications/preferences/email_digest/disable"
    );
    assert!(
        signed
            .as_ref()
            .query_pairs()
            .any(|(key, value)| key == "id" && value == "conation|user@example.com")
    );
}
