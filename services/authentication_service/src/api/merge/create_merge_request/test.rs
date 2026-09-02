use super::*;

#[test]
fn email_uses_conation_display_brand_and_operator_owned_contacts() {
    assert_eq!(MERGE_REQUEST_SUBJECT, "Conation Account Merge Request");
    assert!(MERGE_REQUEST_TEMPLATE.contains("Conation Account Merge Request"));
    assert!(MERGE_REQUEST_TEMPLATE.contains("your Conation account"));
    assert!(!MERGE_REQUEST_TEMPLATE.contains("your macro account"));

    let rendered = render_merge_request_email(
        "requester@example.test",
        "123456",
        "https://workspace.example/app",
        "help@workspace.example",
    );

    assert!(rendered.contains("href=\"https://workspace.example/app\""));
    assert!(rendered.contains("mailto:help@workspace.example"));
    assert!(rendered.contains("requester@example.test"));
    assert!(rendered.contains("123456"));
    assert!(!rendered.contains("macro.com"));
    assert!(!rendered.contains("amazonaws.com"));
}
