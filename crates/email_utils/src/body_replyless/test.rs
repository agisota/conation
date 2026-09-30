use super::compute_body_replyless;

#[test]
fn test_extract_message_reply_outlook_test_1() {
    let full_email = include_str!("testdata/outlook-test-1/full.html");
    let expected_reply = include_str!("testdata/outlook-test-1/body_replyless.html");

    test_email_extraction(full_email, expected_reply, "outlook-test-1");
}

#[test]
fn test_extract_message_reply_outlook_test_2() {
    let full_email = include_str!("testdata/outlook-test-2/full.html");
    let expected_reply = include_str!("testdata/outlook-test-2/body_replyless.html");

    test_email_extraction(full_email, expected_reply, "outlook-test-2");
}

#[test]
fn test_extract_message_reply_test_1() {
    let full_email = include_str!("testdata/test-1/full.html");
    let expected_reply = include_str!("testdata/test-1/body_replyless.html");

    test_email_extraction(full_email, expected_reply, "test-1");
}

#[test]
fn test_extract_message_reply_test_2() {
    let full_email = include_str!("testdata/test-2/full.html");
    let expected_reply = include_str!("testdata/test-2/body_replyless.html");

    test_email_extraction(full_email, expected_reply, "test-2");
}

#[test]
fn test_extract_message_reply_test_3() {
    let full_email = include_str!("testdata/test-3/full.html");
    let expected_reply = include_str!("testdata/test-3/body_replyless.html");

    test_email_extraction(full_email, expected_reply, "test-3");
}

/// gmail selectors WITHOUT a gmail_attr div within them should not be split off
#[test]
fn test_extract_message_reply_test_4() {
    let full_email = include_str!("testdata/test-4/full.html");
    let expected_reply = include_str!("testdata/test-4/body_replyless.html");

    test_email_extraction(full_email, expected_reply, "test-4");
}

/// the entire email (including style tags before the body) should be used if no splitter
/// is found on the email
#[test]
fn test_extract_message_reply_test_5() {
    let full_email = include_str!("testdata/test-5/full.html");
    let expected_reply = include_str!("testdata/test-5/body_replyless.html");

    test_email_extraction(full_email, expected_reply, "test-5");
}

fn test_email_extraction(full_email: &str, expected_reply: &str, test_name: &str) {
    let body_replyless = compute_body_replyless(None, Some(full_email), None);

    assert_eq!(
        body_replyless
            .unwrap()
            .replace(" ", "")
            .replace("\n", "")
            .trim(),
        expected_reply.replace(" ", "").replace("\n", "").trim(),
        "Test '{}' failed: extracted reply doesn't match expected",
        test_name
    );
}

#[test]
fn forward_subject_variants_preserve_full_html_body() {
    let body = "<html><body><div>latest reply</div><div class=\"gmail_quote\"><div class=\"gmail_attr\">On Wed, Jan 1, 2025 wrote:</div><blockquote>forwarded detail</blockquote></div></body></html>";

    for subject in [
        "Fwd:",
        "FW:",
        "fw:",
        "fwd:",
        "FwD:",
        " \t fwd:",
        "  fW: update",
    ] {
        assert_eq!(
            compute_body_replyless(Some(subject), Some(body), None),
            Some(body.to_string()),
            "forward subject {subject:?} should preserve the original HTML"
        );
    }
}

#[test]
fn non_forward_html_subjects_still_remove_gmail_quote() {
    let body = "<html><body><div>latest reply</div><div class=\"gmail_quote\"><div class=\"gmail_attr\">On Wed, Jan 1, 2025 wrote:</div><blockquote>forwarded detail</blockquote></div></body></html>";
    let expected = Some("<div>latest reply</div>".to_string());

    for subject in [
        None,
        Some(""),
        Some("fwiw:"),
        Some("Re: Fwd:"),
        Some("fwdish:"),
        Some("FWX:"),
        Some("forward:"),
        Some("Fwd update"),
        Some("FW update"),
    ] {
        assert_eq!(
            compute_body_replyless(subject, Some(body), None),
            expected,
            "non-forward subject {subject:?} should retain normal HTML splitting"
        );
    }
}

#[test]
fn forward_subject_variants_preserve_full_plaintext_body() {
    let body = "latest reply\n\nFrom: sender\nSubject: forwarded message\n\nforwarded detail";

    for subject in [
        "Fwd:",
        "FW:",
        "fw:",
        "fwd:",
        "FwD:",
        " \t fwd:",
        "  fW: update",
    ] {
        assert_eq!(
            compute_body_replyless(Some(subject), None, Some(body)),
            Some(body.to_string()),
            "forward subject {subject:?} should preserve the original plaintext"
        );
    }
}

#[test]
fn non_forward_plaintext_subjects_still_remove_forwarded_header() {
    let body = "latest reply\n\nFrom: sender\nSubject: forwarded message\n\nforwarded detail";
    let expected = Some("latest reply".to_string());

    for subject in [
        None,
        Some(""),
        Some("fwiw:"),
        Some("Re: Fwd:"),
        Some("fwdish:"),
        Some("FWX:"),
        Some("forward:"),
        Some("Fwd update"),
        Some("FW update"),
    ] {
        assert_eq!(
            compute_body_replyless(subject, None, Some(body)),
            expected,
            "non-forward subject {subject:?} should retain normal plaintext splitting"
        );
    }
}

#[test]
fn missing_bodies_remain_none_and_html_takes_precedence() {
    assert_eq!(compute_body_replyless(None, None, None), None);

    let html = "<div>HTML body</div>";
    let text = "plaintext body";
    assert_eq!(
        compute_body_replyless(Some("FW:"), Some(html), Some(text)),
        Some(html.to_string())
    );
}
