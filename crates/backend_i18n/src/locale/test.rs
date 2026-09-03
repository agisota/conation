use super::*;

#[test]
fn defaults_to_russian_without_a_header() {
    assert_eq!(negotiate_accept_language(None), SupportedLocale::Russian);
    assert_eq!(
        negotiate_accept_language(Some("")),
        SupportedLocale::Russian
    );
}

#[test]
fn honors_quality_before_header_order() {
    assert_eq!(
        negotiate_accept_language(Some("en;q=0.4, ru;q=0.9")),
        SupportedLocale::Russian
    );
    assert_eq!(
        negotiate_accept_language(Some("ru;q=0.2, en;q=0.8")),
        SupportedLocale::English
    );
}

#[test]
fn honors_header_order_when_quality_is_equal() {
    assert_eq!(
        negotiate_accept_language(Some("ru, en")),
        SupportedLocale::Russian
    );
    assert_eq!(
        negotiate_accept_language(Some("en;q=0.7, ru;q=0.700")),
        SupportedLocale::English
    );
}

#[test]
fn falls_back_from_regional_tags() {
    assert_eq!(
        negotiate_accept_language(Some("RU-ru")),
        SupportedLocale::Russian
    );
    assert_eq!(
        negotiate_accept_language(Some("en-GB")),
        SupportedLocale::English
    );
}

#[test]
fn excludes_zero_quality_ranges() {
    assert_eq!(
        negotiate_accept_language(Some("ru;q=0, en;q=0.2")),
        SupportedLocale::English
    );
    assert_eq!(
        negotiate_accept_language(Some("en;q=0, ru;q=0.001")),
        SupportedLocale::Russian
    );
}

#[test]
fn skips_unsupported_ranges_before_a_supported_one() {
    assert_eq!(
        negotiate_accept_language(Some("de-DE, fr;q=0.9, ru;q=0.8")),
        SupportedLocale::Russian
    );
}

#[test]
fn malformed_unsupported_and_wildcard_values_fall_back_to_russian() {
    for value in [
        "ru;q=1.1",
        "ru;q=0.1234",
        "ru;q=wat",
        "ru_RU",
        "fr-FR",
        "*",
        "*;q=1",
    ] {
        assert_eq!(
            negotiate_accept_language(Some(value)),
            SupportedLocale::Russian,
            "value: {value}"
        );
    }
}

#[test]
fn wildcard_uses_russian_as_the_server_default() {
    assert_eq!(
        negotiate_accept_language(Some("*;q=0.9, ru;q=0.8")),
        SupportedLocale::Russian
    );
    assert_eq!(
        negotiate_accept_language(Some("ru;q=0.9, *;q=0.8")),
        SupportedLocale::Russian
    );
}

#[test]
fn skips_a_malformed_item_when_a_valid_choice_remains() {
    assert_eq!(
        negotiate_accept_language(Some("en;q=bogus, ru;q=0.5")),
        SupportedLocale::Russian
    );
}
