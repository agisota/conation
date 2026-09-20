use super::build_user_invite_message;

#[test]
fn escapes_organization_html() {
    let org_name = "R&D <img src=x onerror=alert(1)> &lt;Partners&gt;";
    let result = build_user_invite_message(
        org_name,
        "https://app.example.com/invite",
        "support@example.com",
    );

    assert!(result.contains(
        "<strong>R&amp;D &lt;img src=x onerror=alert(1)&gt; &amp;lt;Partners&amp;gt;</strong>"
    ));
    assert!(!result.contains(org_name));
}

#[test]
fn preserves_organization_text_and_invite_url() {
    let invite_url = "https://app.example.com/app/?login=true";
    let result = build_user_invite_message(
        "Acme's \"Team\" – 東京",
        invite_url,
        "support@example.com",
    );

    assert!(result.contains("<strong>Acme's \"Team\" – 東京</strong>"));
    assert!(result.contains(&format!("href=\"{invite_url}\"")));
    assert!(!result.contains("{ORG_NAME}"));
    assert!(!result.contains("{INVITE_URL}"));
    assert!(!result.contains("{PREFIX}"));
    assert!(!result.contains("macro.com/app"));
}
