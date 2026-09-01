use super::*;

#[test]
fn email_uses_conation_display_brand_and_macro_compatibility_contacts() {
    assert_eq!(MERGE_REQUEST_SUBJECT, "Conation Account Merge Request");
    assert!(MERGE_REQUEST_TEMPLATE.contains("Conation Account Merge Request"));
    assert!(MERGE_REQUEST_TEMPLATE.contains("your Conation account"));
    assert!(MERGE_REQUEST_TEMPLATE.contains("https://macro.com"));
    assert!(MERGE_REQUEST_TEMPLATE.contains("support@macro.com"));
    assert!(!MERGE_REQUEST_TEMPLATE.contains("your macro account"));
}
