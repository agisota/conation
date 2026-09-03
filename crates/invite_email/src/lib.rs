#![deny(missing_docs)]
//! Domain models for invitation email notifications.
//!
//! Contains the [`InviteToMacro`] referral notification, the [`InviteToTeamMetadata`] team
//! invitation notification, the [`ChannelInviteMetadata`] channel invitation, and the
//! [`ReferralCode`] newtype.

#[cfg(test)]
mod test;

use askama::Template;
use conation_env::Environment;
use conation_env_var::maybe_env_vars;
use conation_user_id::cowlike::CowLike;
use conation_user_id::email::EmailStr;
use conation_user_id::email::ReadEmailParts;
use conation_user_id::user_id::MacroUserIdStr;
use model_entity::Entity;
use notification::domain::models::{
    NotifCollapseKey, Notification, NotificationExtEmail, NotificationExtIos, NotificationTitle,
    RateLimitConfig, RateLimitKey,
    apple::{APNSPushNotification, AlertDictionary, Aps, PushNotificationData},
    queue_message::EmailContent,
};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use url::Url;
use utoipa::ToSchema;
use uuid::Uuid;

maybe_env_vars! {
    /// Canonical public URL of the Conation web application, including its app path when it is
    /// mounted below the origin (for example, `https://conation.example/app`).
    struct AppBaseUrl;
    /// Optional public directory containing the branded image used in invitation emails. When
    /// unset, the image is served from [`AppBaseUrl`].
    struct InviteEmailAssetBaseUrl;
    /// Port used by the local browser-facing frontend when no explicit public app URL is set.
    struct FrontendPort;
}

const INVITE_EMAIL_BRAND_ASSET: &str = "logo192.png";

/// Wrapper for the referral code to make it type safe
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ReferralCode(pub String);

/// The metadata for a referral-to-macro notification.
#[derive(Debug, Serialize, Deserialize, Clone, Template)]
#[template(path = "invite.html")]
pub struct InviteToMacro {
    /// The recipient email.
    pub recipient_email: EmailStr<'static>,
    /// The referral code which is templated into the email to track the sender
    /// and reward them.
    pub referral_code: ReferralCode,
    /// The sender's profile picture URL, if available.
    pub sender_profile_picture_url: Option<Url>,
    /// The sender's display name, if they have set one.
    pub sender_name: Option<String>,
    /// The sender's email address.
    #[serde(default)]
    pub sender_email: Option<String>,
}

impl InviteToMacro {
    fn referral_url(&self) -> Url {
        configured_public_email_urls()
            .expect("invite email public URLs must be valid at service startup")
            .referral_url(&self.referral_code)
    }

    fn brand_asset_url(&self) -> Url {
        configured_public_email_urls()
            .expect("invite email public URLs must be valid at service startup")
            .brand_asset_url()
    }
}

impl Notification for InviteToMacro {
    const TYPE_NAME: &'static str = "invite_to_macro";
}

const MINUTES_PER_WEEK: u64 = 60 * 24 * 7;

/// Validated public URLs shared by Conation product emails.
///
/// `APP_BASE_URL` identifies the browser-facing application root and
/// `INVITE_EMAIL_ASSET_BASE_URL`, when configured, identifies the directory
/// containing the shared `logo192.png` brand asset. Both values are validated
/// before a notification service starts accepting work.
#[derive(Clone, Debug)]
pub struct PublicEmailUrls {
    app_base_url: Url,
    asset_base_url: Url,
}

impl PublicEmailUrls {
    /// Returns the canonical browser-facing Conation application URL.
    pub fn app_base_url(&self) -> &Url {
        &self.app_base_url
    }

    fn signup_url(&self) -> Url {
        self.app_url("signup")
    }

    fn team_invite_url(&self, team_invite_id: Uuid) -> Url {
        let mut url = self.app_url("team-invite");
        url.query_pairs_mut()
            .append_pair("id", &team_invite_id.to_string());
        url
    }

    fn referral_url(&self, code: &ReferralCode) -> Url {
        let mut url = self.signup_url();
        url.query_pairs_mut().append_pair("referral_code", &code.0);
        url
    }

    /// Returns the fully qualified URL of the shared Conation email logo.
    pub fn brand_asset_url(&self) -> Url {
        self.asset_base_url
            .join(INVITE_EMAIL_BRAND_ASSET)
            .expect("a validated public asset URL can join a static asset path")
    }

    fn app_url(&self, path: &str) -> Url {
        self.app_base_url
            .join(path)
            .expect("a validated public app URL can join a static route")
    }
}

#[cfg(test)]
fn get_url(env: Environment, code: &ReferralCode) -> Url {
    resolve_invite_urls(env, None, None, None)
        .expect("Conation's default invite email URLs are valid")
        .referral_url(code)
}

/// Resolves and validates public application and brand-asset URLs for product email.
///
/// This is intentionally called once at service startup and the resulting value is passed to
/// renderers. A blank, malformed, credential-bearing, query-bearing, or legacy Macro URL fails
/// closed before an outbound notification can be queued.
pub fn configured_public_email_urls() -> Result<PublicEmailUrls, rootcause::Report> {
    let app_base_url = AppBaseUrl::new();
    let asset_base_url = InviteEmailAssetBaseUrl::new();
    let frontend_port = FrontendPort::new();

    resolve_invite_urls(
        Environment::new_or_prod(),
        app_base_url.as_ref().map(AsRef::as_ref),
        asset_base_url.as_ref().map(AsRef::as_ref),
        frontend_port.as_ref().map(AsRef::as_ref),
    )
}

/// Validates the public browser and asset URLs used to render invitation emails.
///
/// Call this during notification-service startup so a malformed or legacy origin never reaches
/// the email queue. `APP_BASE_URL` is the public app root; an optional
/// `INVITE_EMAIL_ASSET_BASE_URL` may point at an operator-owned CDN directory.
pub fn validate_runtime_config() -> Result<(), rootcause::Report> {
    configured_public_email_urls().map(|_| ())
}

fn resolve_invite_urls(
    environment: Environment,
    configured_app_base_url: Option<&str>,
    configured_asset_base_url: Option<&str>,
    frontend_port: Option<&str>,
) -> Result<PublicEmailUrls, rootcause::Report> {
    let default_base_url: String;
    let app_base_url = match configured_app_base_url {
        Some(value) if value.trim().is_empty() => {
            rootcause::bail!("APP_BASE_URL must not be blank")
        }
        Some(value) => parse_public_url("APP_BASE_URL", value)?,
        None => {
            default_base_url = default_app_base_url(environment, frontend_port)?;
            parse_public_url("APP_BASE_URL", &default_base_url)?
        }
    };

    let asset_base_url = match configured_asset_base_url {
        Some(value) if value.trim().is_empty() => {
            rootcause::bail!("INVITE_EMAIL_ASSET_BASE_URL must not be blank")
        }
        Some(value) => parse_public_url("INVITE_EMAIL_ASSET_BASE_URL", value)?,
        None => app_base_url.clone(),
    };

    Ok(PublicEmailUrls {
        app_base_url: directory_base_url(app_base_url),
        asset_base_url: directory_base_url(asset_base_url),
    })
}

fn default_app_base_url(
    environment: Environment,
    frontend_port: Option<&str>,
) -> Result<String, rootcause::Report> {
    match environment {
        Environment::Production => Ok("https://conation.dev/app".to_string()),
        Environment::Develop => Ok("https://dev.conation.dev/app".to_string()),
        Environment::Local => {
            let port = frontend_port
                .unwrap_or("3000")
                .parse::<u16>()
                .map_err(|_| rootcause::report!("FRONTEND_PORT must be a valid TCP port"))?;
            Ok(format!("http://localhost:{port}/app"))
        }
    }
}

fn parse_public_url(variable: &str, value: &str) -> Result<Url, rootcause::Report> {
    let url = Url::parse(value.trim()).map_err(|_| {
        rootcause::report!(
            "{variable} must be an absolute http(s) URL without userinfo, query, or fragment"
        )
    })?;

    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        rootcause::bail!(
            "{variable} must be an absolute http(s) URL without userinfo, query, or fragment"
        );
    }

    let host = url
        .host_str()
        .expect("the host was checked before reading it")
        .trim_end_matches('.')
        .to_ascii_lowercase();
    if host == "macro.com" || host.ends_with(".macro.com") {
        rootcause::bail!("{variable} must not use a legacy Macro host");
    }

    Ok(url)
}

fn directory_base_url(mut url: Url) -> Url {
    if !url.path().ends_with('/') {
        url.path_segments_mut()
            .expect("a validated http(s) URL is a base URL")
            .push("");
    }
    url
}

impl NotificationExtEmail for InviteToMacro {
    fn format_email(&self) -> EmailContent {
        // Invitees have no stored locale. Render the product default (Russian)
        // rather than the sender's Accept-Language. Recipient-initiated
        // verification mail is the path that negotiates Accept-Language.
        let sender = self
            .sender_name
            .as_deref()
            .or(self.sender_email.as_deref())
            .unwrap_or("Пользователь Conation");
        EmailContent {
            subject: format!("{sender} приглашает вас в Conation"),
            body: self
                .render()
                .expect("InviteToMacro template render failed in format_email"),
        }
    }

    fn rate_limit_config() -> RateLimitConfig {
        // 1 invite email per user per week
        RateLimitConfig {
            max_count: 1,
            window: Duration::from_mins(MINUTES_PER_WEEK),
        }
    }

    fn rate_limit_key(&self) -> RateLimitKey {
        RateLimitKey::builder(&Self::TYPE_NAME)
            .append(&self.recipient_email.0.as_ref())
            .finish()
    }
}

/// Metadata for when a user is invited to a channel.
#[derive(Serialize, Deserialize, Debug, Clone, ToSchema, Template)]
#[serde(rename_all = "camelCase")]
#[template(path = "invite_to_channel.html")]
pub struct ChannelInviteMetadata {
    /// The user who sent the invitation
    #[serde(alias = "invited_by")]
    #[schema(value_type = String)]
    pub invited_by: MacroUserIdStr<'static>,
    /// The name of the channel
    #[serde(default)]
    #[serde(alias = "channel_name")]
    pub channel_name: String,
    /// Message content to show in the invite email, when the invite was triggered by a message.
    #[serde(default)]
    pub message_content: Option<String>,
    /// The sender's profile picture URL, if available.
    #[serde(default)]
    pub sender_profile_picture_url: Option<String>,
}

impl ChannelInviteMetadata {
    fn signup_url(&self) -> Url {
        configured_public_email_urls()
            .expect("invite email public URLs must be valid at service startup")
            .signup_url()
    }

    fn brand_asset_url(&self) -> Url {
        configured_public_email_urls()
            .expect("invite email public URLs must be valid at service startup")
            .brand_asset_url()
    }

    fn sender_display(&self) -> &str {
        self.invited_by.email_str()
    }
}

impl Notification for ChannelInviteMetadata {
    const TYPE_NAME: &'static str = "channel_invite";
}

impl NotificationTitle for ChannelInviteMetadata {
    fn format_title(
        &self,
        _sender_id: Option<MacroUserIdStr<'_>>,
    ) -> Result<String, rootcause::Report> {
        let email = self.invited_by.email_part();
        let sender = email.email_str();
        Ok(format!(
            "{sender} приглашает вас в #{}",
            self.channel_name
        ))
    }

    fn format_body(
        &self,
        _sender_id: Option<MacroUserIdStr<'_>>,
    ) -> Result<String, rootcause::Report> {
        Ok("Откройте Conation, чтобы продолжить".to_string())
    }
}

impl NotificationExtEmail for ChannelInviteMetadata {
    fn format_email(&self) -> EmailContent {
        let sender = self.sender_display();
        EmailContent {
            subject: format!("{sender} приглашает вас в #{}", self.channel_name),
            body: self
                .render()
                .expect("ChannelInviteMetadata template render failed in format_email"),
        }
    }

    fn rate_limit_config() -> RateLimitConfig {
        RateLimitConfig {
            max_count: 1,
            window: Duration::from_hours(24 * 7),
        }
    }

    fn rate_limit_key(&self) -> RateLimitKey {
        RateLimitKey::builder(&Self::TYPE_NAME)
            .append(&self.invited_by)
            .append(&self.channel_name)
            .finish()
    }
}

impl NotificationExtIos for ChannelInviteMetadata {
    type NotifData = PushNotificationData;

    fn collapse_key(&self, entity: &Entity<'_>) -> NotifCollapseKey {
        let entity_type: &'static str = entity.entity_type.into();
        NotifCollapseKey::new(entity_type).append(&entity.entity_id)
    }

    fn as_apns<'a>(
        &self,
        sender_id: Option<MacroUserIdStr<'a>>,
        _entity: &Entity<'_>,
        notification_id: Uuid,
    ) -> Option<APNSPushNotification<Self::NotifData>> {
        let title = self
            .format_title(sender_id.as_ref().map(CowLike::copied))
            .ok()?;
        let body = self.format_body(sender_id).ok()?;
        let mutable_content = self.sender_profile_picture_url.as_ref().map(|_| 1);
        Some(APNSPushNotification {
            aps: Aps {
                alert: Some(notification::domain::models::apple::Alert::Dictionary(
                    AlertDictionary {
                        title: Some(title),
                        body: Some(body),
                        ..Default::default()
                    },
                )),
                mutable_content,
                ..Default::default()
            },
            push_notification_data: PushNotificationData {
                notification_id,
                sender_profile_picture_url: self.sender_profile_picture_url.clone(),
            },
        })
    }
}

/// Metadata for when a user is invited to a team.
#[derive(Serialize, Deserialize, Debug, Clone, ToSchema, Template)]
#[serde(rename_all = "camelCase")]
#[template(path = "invite_to_team.html")]
pub struct InviteToTeamMetadata {
    /// The name of the team being invited to
    #[serde(alias = "team_name")]
    pub team_name: String,
    /// The unique identifier of the team
    #[serde(alias = "team_id")]
    pub team_id: Uuid,
    /// The unique identifier of the team invite
    #[serde(alias = "team_invite_id")]
    pub team_invite_id: Uuid,
    /// The user who sent the invitation
    #[serde(alias = "invited_by")]
    #[schema(value_type = String)]
    pub invited_by: MacroUserIdStr<'static>,
    /// Role/permission level in the team
    pub role: Option<String>,

    /// The sender's profile picture URL, if available.
    #[serde(default)]
    #[schema(value_type = Option<String>)]
    pub sender_profile_picture_url: Option<Url>,
}

impl InviteToTeamMetadata {
    /// Returns the team invite URL for the current environment.
    pub fn invite_url(&self) -> Url {
        configured_public_email_urls()
            .expect("invite email public URLs must be valid at service startup")
            .team_invite_url(self.team_invite_id)
    }

    fn brand_asset_url(&self) -> Url {
        configured_public_email_urls()
            .expect("invite email public URLs must be valid at service startup")
            .brand_asset_url()
    }
}

impl Notification for InviteToTeamMetadata {
    const TYPE_NAME: &'static str = "invite_to_team";
}

impl NotificationExtEmail for InviteToTeamMetadata {
    fn format_email(&self) -> EmailContent {
        EmailContent {
            subject: format!(
                "{} приглашает вас в команду {} в Conation",
                self.invited_by.email_part().as_ref(),
                self.team_name
            ),
            body: self
                .render()
                .expect("InviteToTeamMetadata template render failed in format_email"),
        }
    }

    fn rate_limit_config() -> RateLimitConfig {
        const TWO_DAYS: u64 = 24 * 2;
        RateLimitConfig {
            max_count: 1,
            window: Duration::from_hours(TWO_DAYS),
        }
    }

    fn rate_limit_key(&self) -> RateLimitKey {
        RateLimitKey::builder(&Self::TYPE_NAME)
            .append(&self.team_id)
            .append(&self.invited_by.as_ref())
            .finish()
    }
}
