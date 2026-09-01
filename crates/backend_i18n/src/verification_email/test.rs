use url::Url;

use super::*;

fn render(locale: SupportedLocale, url: &Url) -> RenderedVerificationEmail {
    render_verification_email(
        locale,
        VerificationEmail {
            verification_url: url,
        },
    )
    .expect("the static verification template should render")
}

#[test]
fn renders_complete_english_source_copy() {
    let url = Url::parse("https://auth.conation.dev/email/verify/123").unwrap();
    let rendered = render(SupportedLocale::English, &url);

    assert_eq!(rendered.subject(), "Verify your email address");
    assert!(rendered.html().contains("<html lang=\"en\""));
    assert!(rendered.html().contains("Verify your email"));
    assert!(rendered.html().contains(url.as_str()));
    assert!(rendered.html().contains("support@macro.com"));
}

#[test]
fn renders_complete_russian_copy_and_language() {
    let url = Url::parse("https://auth.conation.dev/email/verify/456").unwrap();
    let rendered = render(SupportedLocale::Russian, &url);

    assert_eq!(rendered.subject(), "Подтвердите адрес электронной почты");
    assert!(rendered.html().contains("<html lang=\"ru\""));
    assert!(rendered.html().contains("Нажмите кнопку ниже"));
    assert!(rendered.html().contains("Подтвердить"));
    assert!(
        rendered
            .html()
            .contains("aria-roledescription=\"электронное письмо\"")
    );
    assert!(!rendered.html().contains("Click the button below"));
}

#[test]
fn escapes_url_query_separators_in_html_attributes() {
    let url =
        Url::parse("https://auth.conation.dev/email/verify/789?source=email&next=%2Fapp").unwrap();
    let rendered = render(SupportedLocale::English, &url);

    assert!(rendered.html().contains("source=email&#38;next=%2Fapp"));
    assert!(!rendered.html().contains("source=email&next="));
}

#[test]
fn has_no_managed_aws_asset_dependency() {
    let url = Url::parse("https://auth.conation.dev/email/verify/123").unwrap();
    let rendered = render(SupportedLocale::English, &url);

    assert!(!rendered.html().contains("amazonaws.com"));
    assert!(rendered.html().contains("Conation"));
}
