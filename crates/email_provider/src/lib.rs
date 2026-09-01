//! Experimental email-provider abstraction for Conation.
//! Supports two backends:
//! - `GmailProvider` — legacy Gmail API via `gmail_client` (kept for connected Gmail accounts)
//! - `StalwartProvider` — a self-hosted Stalwart provisioning client
//!
//! The Stalwart message and watch paths deliberately fail closed until their
//! JMAP implementations are wired end to end. Production Gmail traffic remains
//! on the established `gmail_client` path.

#![deny(missing_docs)]

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use url::Url;

#[cfg(test)]
mod test;

mod environment {
    conation_env_var::env_vars! {
        pub(super) struct StalwartJmapUrl;
        pub(super) struct StalwartAdminUrl;
        pub(super) struct StalwartAdminUser;
        pub(super) struct StalwartAdminPassword;
    }

    conation_env_var::maybe_env_var! {
        pub(super) struct EmailProvider;
    }
}

/// Which email backend is active. Controlled by `EMAIL_PROVIDER` env (gmail|stalwart).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EmailProviderKind {
    /// Legacy Gmail API (requires Google OAuth + GCP PubSub)
    #[default]
    Gmail,
    /// Self-hosted Stalwart JMAP (Conation default)
    Stalwart,
}

impl std::str::FromStr for EmailProviderKind {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "gmail" => Ok(Self::Gmail),
            "stalwart" | "jmap" | "conation" => Ok(Self::Stalwart),
            _ => Err(format!(
                "unknown email provider: {s} (expected gmail|stalwart)"
            )),
        }
    }
}

/// Minimal email thread/message abstractions — provider-agnostic.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderMessage {
    /// Provider-native message id
    pub id: String,
    /// Thread id (JMAP threadId / Gmail threadId)
    pub thread_id: String,
    /// RFC822 raw or parsed
    pub subject: Option<String>,
    /// From address
    pub from: Option<String>,
    /// To addresses
    pub to: Vec<String>,
    /// Date
    pub date: Option<chrono::DateTime<chrono::Utc>>,
    /// Has attachments
    pub has_attachments: bool,
    /// Labels (Gmail labels or JMAP keywords)
    pub labels: Vec<String>,
}

/// Provider trait — implemented by Gmail and Stalwart.
#[async_trait]
pub trait EmailProvider: Send + Sync {
    /// Provider kind
    fn kind(&self) -> EmailProviderKind;

    /// List recent threads/messages
    async fn list_threads(
        &self,
        access_token: &str,
        max_results: u32,
        page_token: Option<&str>,
    ) -> Result<Vec<ProviderMessage>, ProviderError>;

    /// Get single message by id
    async fn get_message(
        &self,
        access_token: &str,
        message_id: &str,
    ) -> Result<Option<ProviderMessage>, ProviderError>;

    /// Send MIME message (for Stalwart: JMAP EmailSubmission; for Gmail: gmail.send)
    async fn send_message(
        &self,
        access_token: &str,
        mime: &[u8],
        thread_id: Option<&str>,
    ) -> Result<SendResult, ProviderError>;

    /// Register push/watch (Gmail: users.watch -> PubSub; Stalwart: JMAP push subscription)
    async fn register_watch(&self, access_token: &str) -> Result<WatchResult, ProviderError>;

    /// Stop watch
    async fn stop_watch(&self, access_token: &str) -> Result<(), ProviderError>;
}

/// Result of sending a message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendResult {
    /// Provider message id
    pub message_id: String,
    /// Thread id
    pub thread_id: String,
}

/// Result of registering a watch
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchResult {
    /// Expiration (if any)
    pub expiration: Option<chrono::DateTime<chrono::Utc>>,
    /// Provider watch id / history id
    pub watch_id: String,
}

/// Provider errors
#[derive(Debug, thiserror::Error)]
pub enum ProviderError {
    /// Transport / HTTP error
    #[error("transport error: {0}")]
    Transport(String),
    /// Authentication error (token expired / invalid)
    #[error("authentication error: {0}")]
    Auth(String),
    /// Not found
    #[error("not found: {0}")]
    NotFound(String),
    /// Provider-specific
    #[error("provider error: {0}")]
    Provider(String),
    /// Required provider configuration is missing or invalid.
    #[error("provider configuration error: {0}")]
    Configuration(String),
    /// The selected provider operation is not implemented yet.
    #[error("unsupported provider operation: {0}")]
    Unsupported(&'static str),
}

/// Stalwart JMAP provider — talks to Stalwart via JMAP at `STALWART_JMAP_URL`.
/// For Conation self-host: `http://stalwart:8080`.
#[derive(Clone)]
pub struct StalwartProvider {
    /// Base JMAP URL (e.g. `http://stalwart:8080`)
    pub jmap_url: Url,
    /// Admin API URL for provisioning (e.g. `http://stalwart:8080/api`)
    pub admin_url: Url,
    admin_user: String,
    admin_password: String,
}

impl std::fmt::Debug for StalwartProvider {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("StalwartProvider")
            .field("jmap_url", &self.jmap_url)
            .field("admin_url", &self.admin_url)
            .field("admin_user", &"[redacted]")
            .field("admin_password", &"[redacted]")
            .finish()
    }
}

impl StalwartProvider {
    /// Creates an explicitly configured Stalwart provider.
    #[must_use]
    pub fn new(
        jmap_url: Url,
        admin_url: Url,
        admin_user: impl Into<String>,
        admin_password: impl Into<String>,
    ) -> Self {
        Self {
            jmap_url,
            admin_url,
            admin_user: admin_user.into(),
            admin_password: admin_password.into(),
        }
    }

    /// Loads required Stalwart settings through the repository environment wrapper.
    pub fn from_env() -> Result<Self, ProviderError> {
        let jmap_url = environment::StalwartJmapUrl::new()
            .map_err(|error| ProviderError::Configuration(error.to_string()))?;
        let admin_url = environment::StalwartAdminUrl::new()
            .map_err(|error| ProviderError::Configuration(error.to_string()))?;
        let admin_user = environment::StalwartAdminUser::new()
            .map_err(|error| ProviderError::Configuration(error.to_string()))?;
        let admin_password = environment::StalwartAdminPassword::new()
            .map_err(|error| ProviderError::Configuration(error.to_string()))?;

        Ok(Self::new(
            Url::parse(jmap_url.as_ref())
                .map_err(|error| ProviderError::Configuration(error.to_string()))?,
            Url::parse(admin_url.as_ref())
                .map_err(|error| ProviderError::Configuration(error.to_string()))?,
            admin_user.as_ref(),
            admin_password.as_ref(),
        ))
    }

    /// Provision a new mailbox for `email` (called on signup).
    /// Uses Stalwart Admin API: `POST /api/principal`
    pub async fn provision_account(
        &self,
        email: &str,
        password: &str,
    ) -> Result<(), ProviderError> {
        let client = reqwest::Client::new();
        let url = self
            .admin_url
            .join("principal")
            .map_err(|error| ProviderError::Configuration(error.to_string()))?;
        let body = serde_json::json!({
            "type": "individual",
            "name": email.split('@').next().unwrap_or(email),
            "emails": [email],
            "secrets": [password],
        });
        let resp = client
            .post(url)
            .basic_auth(&self.admin_user, Some(&self.admin_password))
            .json(&body)
            .send()
            .await
            .map_err(|e| ProviderError::Transport(e.to_string()))?;
        if !resp.status().is_success() {
            return Err(ProviderError::Provider(format!(
                "stalwart provision failed with HTTP {}",
                resp.status()
            )));
        }
        Ok(())
    }
}

#[async_trait]
impl EmailProvider for StalwartProvider {
    fn kind(&self) -> EmailProviderKind {
        EmailProviderKind::Stalwart
    }

    async fn list_threads(
        &self,
        _access_token: &str,
        _max_results: u32,
        _page_token: Option<&str>,
    ) -> Result<Vec<ProviderMessage>, ProviderError> {
        Err(ProviderError::Unsupported(
            "Stalwart JMAP Email/query is not wired",
        ))
    }

    async fn get_message(
        &self,
        _access_token: &str,
        _message_id: &str,
    ) -> Result<Option<ProviderMessage>, ProviderError> {
        Err(ProviderError::Unsupported(
            "Stalwart JMAP Email/get is not wired",
        ))
    }

    async fn send_message(
        &self,
        _access_token: &str,
        mime: &[u8],
        _thread_id: Option<&str>,
    ) -> Result<SendResult, ProviderError> {
        let _ = mime;
        Err(ProviderError::Unsupported(
            "Stalwart JMAP EmailSubmission is not wired",
        ))
    }

    async fn register_watch(&self, _access_token: &str) -> Result<WatchResult, ProviderError> {
        Err(ProviderError::Unsupported(
            "Stalwart JMAP push subscriptions are not wired",
        ))
    }

    async fn stop_watch(&self, _access_token: &str) -> Result<(), ProviderError> {
        Err(ProviderError::Unsupported(
            "Stalwart JMAP push subscriptions are not wired",
        ))
    }
}

/// Builds the experimental provider selected by `EMAIL_PROVIDER`.
///
/// The established Gmail integration is intentionally not duplicated by this
/// crate. Selecting Gmail returns an explicit error and callers must use
/// `gmail_client`.
pub fn provider_from_env() -> Result<Box<dyn EmailProvider>, ProviderError> {
    let kind = environment::EmailProvider::new()
        .map(|value| value.as_ref().parse())
        .transpose()
        .map_err(ProviderError::Configuration)?
        .unwrap_or_default();
    match kind {
        EmailProviderKind::Gmail => Err(ProviderError::Unsupported(
            "Gmail remains on the gmail_client integration",
        )),
        EmailProviderKind::Stalwart => Ok(Box::new(StalwartProvider::from_env()?)),
    }
}
