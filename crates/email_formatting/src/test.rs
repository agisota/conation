use super::*;
use hmac::Mac;

fn has_cyrillic(text: &str) -> bool {
    text.chars()
        .any(|character| matches!(character, '\u{0400}'..='\u{052f}'))
}

fn render_digest(total_count: usize, num_truncated: usize) -> String {
    let unsubscribe_url = SignedUrl::new(
        "https://notification-service.macro.com/preferences/disable"
            .parse()
            .expect("test URL must be valid"),
        Hmac::<Sha256>::new_from_slice(b"email-formatting-test-key")
            .expect("HMAC accepts test key"),
    );

    DigestTemplate {
        notifs: vec![NotifPreview {
            created_at: Utc::now(),
            title: "A document was shared with you".to_string(),
            body: "Review the document when you have a moment.".to_string(),
        }],
        num_truncated,
        total_count,
        unsubscribe_url,
    }
    .render()
    .expect("digest template should render")
}

#[test]
fn singular_digest_uses_consistent_english_fallback_copy() {
    let body = render_digest(1, 0);

    assert_eq!(digest_subject(1), "You have 1 new notification on Conation");
    assert!(body.contains("You have 1 new notification"));
    assert!(body.contains("View in Conation"));
    assert!(body.contains("Unsubscribe from digest emails"));
    assert!(body.contains("https://macro.com"));
    assert!(!body.contains("https://conation.dev"));
    assert!(!has_cyrillic(&body));
}

#[test]
fn many_digest_uses_plural_english_fallback_copy() {
    let body = render_digest(17, 2);

    assert_eq!(
        digest_subject(17),
        "You have 17 new notifications on Conation"
    );
    assert!(body.contains("You have 17 new notifications"));
    assert!(body.contains("and 2 more notifications"));
    assert!(!has_cyrillic(&body));
}
