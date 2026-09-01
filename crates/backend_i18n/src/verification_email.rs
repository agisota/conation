#[cfg(test)]
mod test;

mod catalog;

use askama::Template;
use url::Url;

use crate::SupportedLocale;
use catalog::catalog_for;

const SUPPORT_EMAIL: &str = "support@macro.com";

/// Typed input for rendering an address-verification email.
#[derive(Clone, Copy, Debug)]
pub struct VerificationEmail<'a> {
    /// The absolute, deployment-specific URL that completes verification.
    pub verification_url: &'a Url,
}

/// A fully localized verification email ready for an outbound mail adapter.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RenderedVerificationEmail {
    subject: String,
    html: String,
}

impl RenderedVerificationEmail {
    /// Returns the localized subject line.
    #[must_use]
    pub fn subject(&self) -> &str {
        &self.subject
    }

    /// Returns the localized HTML body.
    #[must_use]
    pub fn html(&self) -> &str {
        &self.html
    }
}

#[derive(Template)]
#[template(path = "verification_email.html")]
struct VerificationEmailTemplate<'a> {
    language_tag: &'static str,
    copy: &'static catalog::VerificationEmailCatalog,
    verification_url: &'a Url,
    support_email: &'static str,
}

/// Renders an email using the catalog for `locale` and the shared HTML structure.
///
/// Askama's HTML auto-escaping applies to all dynamic values, including the
/// deployment URL.
pub fn render_verification_email(
    locale: SupportedLocale,
    email: VerificationEmail<'_>,
) -> Result<RenderedVerificationEmail, askama::Error> {
    let copy = catalog_for(locale);
    let html = VerificationEmailTemplate {
        language_tag: locale.language_tag(),
        copy,
        verification_url: email.verification_url,
        support_email: SUPPORT_EMAIL,
    }
    .render()?;

    Ok(RenderedVerificationEmail {
        subject: copy.subject.to_owned(),
        html,
    })
}
