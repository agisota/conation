use askama::Template;
use chrono::{DateTime, Utc};
use conation_service_urls::Url;
use conation_user_id::cowlike::CowLike;
use hmac::Hmac;
use model_notifications::NotifEvent;
use notification::domain::models::{
    Notification, NotificationExtEmail, NotificationTitle, RateLimitConfig, RateLimitKey,
    UserNotificationRow, email_notification_digest::ports::DigestBatch,
    queue_message::EmailContent, signing::SignedUrl,
};
use rootcause::{Report, report};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::time::Duration;

#[cfg(test)]
mod test;

#[derive(Template)]
#[template(path = "digest.html")]
struct DigestTemplate {
    notifs: Vec<NotifPreview>,
    num_truncated: usize,
    heading: String,
    truncated_summary: String,
    app_url: Url,
    brand_asset_url: Url,
    /// the signed url which allows a client to unsubscribe from the email in an unauthenticated context
    unsubscribe_url: SignedUrl,
}

struct NotifPreview {
    created_at: DateTime<Utc>,
    title: String,
    body: String,
}

const TRUNCATE_LEN: usize = 15;
const BODY_MAX_CHARS: usize = 500;

/// Validated public URLs used when rendering a notification digest.
///
/// The application URL and image URL are supplied by the service at startup from the shared
/// public-email configuration. The notification URL is the externally reachable origin (or
/// origin plus reverse-proxy path prefix) used for HMAC-signed unsubscribe links.
#[derive(Debug, Clone)]
pub struct DigestEmailUrls {
    app_url: Url,
    brand_asset_url: Url,
    notification_service_url: Url,
}

impl DigestEmailUrls {
    /// Validates the browser-facing URLs used in digest mail.
    pub fn new(
        app_url: Url,
        brand_asset_url: Url,
        notification_service_url: Url,
    ) -> Result<Self, Report> {
        validate_public_url("APP_BASE_URL", &app_url)?;
        validate_public_url("INVITE_EMAIL_ASSET_BASE_URL", &brand_asset_url)?;
        validate_public_url(
            "OVERRIDE_NOTIFICATION_SERVICE_URL",
            &notification_service_url,
        )?;

        Ok(Self {
            app_url,
            brand_asset_url,
            notification_service_url: directory_base_url(notification_service_url),
        })
    }

    fn unsubscribe_url(
        &self,
        notification_type: &str,
        user_id: &str,
        sha: Hmac<Sha256>,
    ) -> SignedUrl {
        let relative_path = format!("user_notifications/preferences/{notification_type}/disable");
        let mut unsubscribe_url = self
            .notification_service_url
            .join(&relative_path)
            .expect("a validated public notification URL can join a static route");
        unsubscribe_url.query_pairs_mut().append_pair("id", user_id);
        SignedUrl::new(unsubscribe_url, sha)
    }
}

fn validate_public_url(variable: &str, url: &Url) -> Result<(), Report> {
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(report!(
            "{variable} must be an absolute http(s) URL without userinfo, query, or fragment"
        ));
    }

    let host = url
        .host_str()
        .expect("the host was checked before reading it")
        .trim_end_matches('.')
        .to_ascii_lowercase();
    if host == "macro.com" || host.ends_with(".macro.com") {
        return Err(report!("{variable} must not use a legacy Macro host"));
    }

    Ok(())
}

fn directory_base_url(mut url: Url) -> Url {
    if !url.path().ends_with('/') {
        url.path_segments_mut()
            .expect("a validated http(s) URL is a base URL")
            .push("");
    }
    url
}

#[derive(Clone, Copy)]
enum RussianNumberForm {
    One,
    Few,
    Many,
}

fn russian_number_form(count: usize) -> RussianNumberForm {
    if (11..=14).contains(&(count % 100)) {
        return RussianNumberForm::Many;
    }

    match count % 10 {
        1 => RussianNumberForm::One,
        2..=4 => RussianNumberForm::Few,
        _ => RussianNumberForm::Many,
    }
}

fn notification_phrase(count: usize) -> String {
    match russian_number_form(count) {
        RussianNumberForm::One => format!("{count} новое уведомление"),
        RussianNumberForm::Few => format!("{count} новых уведомления"),
        RussianNumberForm::Many => format!("{count} новых уведомлений"),
    }
}

fn notification_noun(count: usize) -> &'static str {
    match russian_number_form(count) {
        RussianNumberForm::One => "уведомление",
        RussianNumberForm::Few => "уведомления",
        RussianNumberForm::Many => "уведомлений",
    }
}

fn digest_subject(notification_count: usize) -> String {
    // Product-default Russian: recipient locale is not persisted (no user.locale).
    // Do not infer from the sender. Accept-Language is only negotiated on
    // recipient-initiated verification mail.
    format!(
        "У вас {} в Conation",
        notification_phrase(notification_count)
    )
}

fn truncate_body(s: String) -> String {
    if s.chars().count() <= BODY_MAX_CHARS {
        return s;
    }
    let byte_limit = s
        .char_indices()
        .nth(BODY_MAX_CHARS)
        .map(|(i, _)| i)
        .unwrap_or(s.len());
    let truncated = &s[..byte_limit];
    match truncated.rfind(' ') {
        Some(pos) => format!("{}…", s[..pos].trim_end()),
        None => format!("{}…", truncated),
    }
}

impl NotifPreview {
    #[tracing::instrument(err)]
    fn new(v: UserNotificationRow<NotifEvent>) -> Result<Self, Report> {
        let title = v
            .notification_metadata
            .format_title(v.sender_id.as_ref().map(CowLike::copied))?;
        let body = truncate_body(v.notification_metadata.format_body(v.sender_id)?);
        Ok(NotifPreview {
            created_at: v.created_at,
            title,
            body,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailDigestNotification {
    /// the templated html string of the email
    inner_html_string: String,
    /// the subject line of the notification
    subject: String,
}

impl EmailDigestNotification {
    pub fn new_from_digest_batch(
        digest: DigestBatch,
        urls: &DigestEmailUrls,
        sha: Hmac<Sha256>,
    ) -> Result<Self, Report> {
        let DigestBatch {
            user_id,
            notifications,
            ..
        } = digest;

        let input_len = notifications.len();

        fn log_err<E: std::fmt::Debug>(e: &E) {
            tracing::error!("{e:?}");
        }

        let notifs: Vec<_> = notifications
            .into_iter()
            .map(|v| v.deserialize_metadata::<NotifEvent>())
            .filter_map(|res| res.inspect_err(log_err).ok())
            .map(NotifPreview::new)
            .filter_map(Result::ok)
            .take(TRUNCATE_LEN)
            .collect();

        let preview_len = notifs.len();
        if preview_len == 0 {
            return Err(report!("Batch with 0 notifications"));
        }
        let num_truncated = input_len - preview_len;

        let unsubscribe_url = urls.unsubscribe_url(Self::TYPE_NAME, user_id.as_ref(), sha);

        let inner_html_string = DigestTemplate {
            notifs,
            num_truncated,
            heading: format!("У вас {}", notification_phrase(input_len)),
            truncated_summary: format!("Ещё {num_truncated} {}", notification_noun(num_truncated)),
            app_url: urls.app_url.clone(),
            brand_asset_url: urls.brand_asset_url.clone(),
            unsubscribe_url,
        }
        .render()?;

        Ok(EmailDigestNotification {
            inner_html_string,
            subject: digest_subject(input_len),
        })
    }
}

impl Notification for EmailDigestNotification {
    const TYPE_NAME: &'static str = "email-digest-notification";
}

impl NotificationExtEmail for EmailDigestNotification {
    fn format_email(&self) -> EmailContent {
        EmailContent {
            subject: self.subject.clone(),
            body: self.inner_html_string.clone(),
        }
    }

    fn rate_limit_config() -> RateLimitConfig {
        RateLimitConfig {
            max_count: 600,
            window: Duration::from_hours(1),
        }
    }

    fn rate_limit_key(&self) -> RateLimitKey {
        // NB: this key is currently intentionally shared across all users out of an abundance of caution to limit over-sending on SES
        RateLimitKey::from_str_hashed(&Self::TYPE_NAME)
    }
}
