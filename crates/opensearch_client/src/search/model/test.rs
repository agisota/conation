use super::*;

#[test]
fn truncate_preserving_tags_no_tags() {
    let result = truncate_preserving_tags("hello world", 5);
    assert_eq!(result, "hello...");
}

#[test]
fn truncate_preserving_tags_within_limit() {
    let result = truncate_preserving_tags("hello", 10);
    assert_eq!(result, "hello");
}

#[test]
fn truncate_preserving_tags_with_highlight() {
    let result = truncate_preserving_tags("say <conation_em>hello</conation_em> world", 20);
    assert_eq!(result, "say <conation_em>hello</conation_em> world");
}

#[test]
fn truncate_preserving_tags_cuts_after_highlight() {
    let result = truncate_preserving_tags("say <conation_em>hello</conation_em> world foo bar", 12);
    assert_eq!(result, "say <conation_em>hello</conation_em> wo...");
}

#[test]
fn truncate_preserving_tags_closes_open_tag() {
    let result = truncate_preserving_tags("<conation_em>hello world</conation_em>", 7);
    assert_eq!(result, "<conation_em>hello w</conation_em>...");
}

#[test]
fn truncate_preserving_tags_excludes_tags_from_count() {
    let input = "a<conation_em>b</conation_em>c";
    let result = truncate_preserving_tags(input, 3);
    assert_eq!(result, "a<conation_em>b</conation_em>c");
}

#[test]
fn window_highlight_near_start() {
    let input = "say <conation_em>hello</conation_em> world";
    let result = window_around_highlight(input, 300);
    assert_eq!(result, "say <conation_em>hello</conation_em> world");
}

#[test]
fn window_highlight_far_from_start() {
    let padding = "x".repeat(300);
    let input = format!("{padding} say <conation_em>hello</conation_em> world end");
    let result = window_around_highlight(&input, 1000);
    assert!(result.starts_with("..."));
    assert!(result.contains("<conation_em>hello</conation_em>"));
    let before_tag = result.find("<conation_em>").unwrap();
    let visible_before: usize = result[..before_tag]
        .replace(OPEN_TAG, "")
        .replace(CLOSE_TAG, "")
        .chars()
        .count();
    assert!(
        visible_before <= CHARS_BEFORE_HIGHLIGHT + 10,
        "expected <= {} chars before highlight, got {}",
        CHARS_BEFORE_HIGHLIGHT + 10,
        visible_before
    );
}

#[test]
fn window_no_highlight_tag() {
    let input = "just some text without any highlight tags at all";
    let result = window_around_highlight(input, 20);
    assert_eq!(result, "just some text witho...");
}

#[test]
fn window_trims_on_word_boundary() {
    let padding = "word ".repeat(100);
    let input = format!("{padding}<conation_em>match</conation_em> end");
    let result = window_around_highlight(&input, 1000);
    assert!(result.starts_with("..."));
    let after_ellipsis = &result[3..];
    assert!(
        !after_ellipsis.starts_with(' '),
        "should trim to word boundary, got: {after_ellipsis}"
    );
}

#[test]
fn normalize_strips_invisible_and_collapses_whitespace() {
    let input = "hello\n\n  world\u{200B}foo";
    let result = normalize_highlight_fragment(input);
    assert_eq!(result, "hello worldfoo");
}

#[test]
fn normalize_preserves_highlight_tags() {
    let input = "say <conation_em>hello</conation_em> world";
    let result = normalize_highlight_fragment(input);
    assert_eq!(result, "say <conation_em>hello</conation_em> world");
}

#[test]
fn normalize_windows_when_highlight_is_far() {
    let padding = "a ".repeat(200);
    let input = format!("{padding}<conation_em>match</conation_em> end");
    let result = normalize_highlight_fragment(&input);
    assert!(result.contains("<conation_em>match</conation_em>"));
    assert!(result.starts_with("..."));
}

#[test]
fn find_tag_aware_byte_offset_skips_tags() {
    let s = "ab<conation_em>cd</conation_em>ef";
    let offset = find_tag_aware_byte_offset(s, 4);
    let remaining = &s[offset..];
    assert_eq!(remaining.replace(OPEN_TAG, "").replace(CLOSE_TAG, ""), "ef");
}

#[test]
fn find_tag_aware_byte_offset_handles_no_tags() {
    let s = "abcdef";
    let offset = find_tag_aware_byte_offset(s, 3);
    assert_eq!(&s[offset..], "def");
}

#[test]
fn find_tag_aware_byte_offset_handles_utf8() {
    let s = "café";
    let offset = find_tag_aware_byte_offset(s, "caf".len());
    assert_eq!(&s[offset..], "é");
}

#[test]
fn merge_highlights_across_at_joins_email_tokens() {
    let input = "sent to <conation_em>hutch</conation_em>@<conation_em>macro.com</conation_em> today";
    let result = merge_highlights_across_at(input);
    assert_eq!(result, "sent to <conation_em>hutch@macro.com</conation_em> today");
}

#[test]
fn merge_highlights_across_at_leaves_standalone_highlights() {
    let input = "say <conation_em>hello</conation_em> world";
    let result = merge_highlights_across_at(input);
    assert_eq!(result, "say <conation_em>hello</conation_em> world");
}

#[test]
fn merge_highlights_across_at_leaves_plain_at_symbol() {
    let input = "contact us @ <conation_em>macro</conation_em>";
    let result = merge_highlights_across_at(input);
    assert_eq!(result, "contact us @ <conation_em>macro</conation_em>");
}

#[test]
fn merge_highlights_across_at_multiple_pairs() {
    let input = "<conation_em>a</conation_em>@<conation_em>b.com</conation_em> and <conation_em>c</conation_em>@<conation_em>d.org</conation_em>";
    let result = merge_highlights_across_at(input);
    assert_eq!(
        result,
        "<conation_em>a@b.com</conation_em> and <conation_em>c@d.org</conation_em>"
    );
}

#[test]
fn normalize_merges_email_highlight_tokens() {
    let input = "hi <conation_em>hutch</conation_em>@<conation_em>macro.com</conation_em> thanks";
    let result = normalize_highlight_fragment(input);
    assert_eq!(result, "hi <conation_em>hutch@macro.com</conation_em> thanks");
}

#[test]
fn window_real_world_email_fragment() {
    let input = "Hi Gabriel, We often need to copy email to other tools — our notes, todo list, or Slack. In Gmail and Outlook, this is error prone and tedious. In Superhuman Mail, it is accurate and instantaneous: Hit Cmd+C (Mac) or Ctrl+C (Windows) to copy the current message. Hit it again to copy the conversation. Hit Cmd+V (Mac) or Ctrl+V (Windows) to paste wherever you want. You can even paste straight into Superhuman Mail! No selecting, no dragging, no fuss. I'd love to hear what you think: please reply and say <conation_em>hello</conation_em> :) Speak soon, Rahul";
    let result = window_around_highlight(input, MAX_VISIBLE_FRAGMENT_CHARS);
    assert!(result.contains("<conation_em>hello</conation_em>"));
    let tag_pos = result.find("<conation_em>").unwrap();
    let visible_before: usize = result[..tag_pos]
        .replace(OPEN_TAG, "")
        .replace(CLOSE_TAG, "")
        .chars()
        .count();
    assert!(
        visible_before <= CHARS_BEFORE_HIGHLIGHT + 10,
        "highlight should be within first ~{} chars, but was at {}",
        CHARS_BEFORE_HIGHLIGHT,
        visible_before
    );
}
