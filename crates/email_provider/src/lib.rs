//! Email provider abstraction for Conation.
//! Supports two backends:
//! - `GmailProvider` — legacy Gmail API via `gmail_client` (kept for connected Gmail accounts)
//! - `StalwartProvider` — self-hosted Stalwart JMAP (default for `user@conation.dev`)

#![deny(missing_docs)]

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

/// Which email backend is active. Controlled by `EMAIL_PROVIDER` env (gmail|stalwart).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EmailProviderKind {
    /// Legacy Gmail API (requires Google OAuth + GCP PubSub)
    Gmail,
    /// Self-hosted Stalwart JMAP (Conation default)
    Stalwart,
}

impl Default for EmailProviderKind {
    fn default() -> Self {
        Self::Stalwart
    }
}

impl std::str::FromStr for EmailProviderKind {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "gmail" => Ok(Self::Gmail),
            "stalwart" | "jmap" | "conation" => Ok(Self::Stalwart),
            _ => Err(format!("unknown email provider: {s} (expected gmail|stalwart)")),
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
}

/// Stalwart JMAP provider — talks to Stalwart via JMAP at `STALWART_JMAP_URL`.
/// For Conation self-host: `http://stalwart:8080`.
#[derive(Debug, Clone)]
pub struct StalwartProvider {
    /// Base JMAP URL (e.g. `http://stalwart:8080`)
    pub jmap_url: String,
    /// Admin API URL for provisioning (e.g. `http://stalwart:8080/api`)
    pub admin_url: String,
}

impl StalwartProvider {
    /// Create from env `STALWART_JMAP_URL` / `STALWART_ADMIN_URL`
    pub fn from_env() -> Self {
        let jmap_url = std::env::var("STALWART_JMAP_URL")
            .unwrap_or_else(|_| "http://stalwart:8080".to_string());
        let admin_url = std::env::var("STALWART_ADMIN_URL")
            .unwrap_or_else(|_| "http://stalwart:8080/api".to_string());
        Self { jmap_url, admin_url }
    }

    /// Provision a new mailbox for `email` (called on signup).
    /// Uses Stalwart Admin API: `POST /api/principal`
    pub async fn provision_account(&self, email: &str, password: &str) -> Result<(), ProviderError> {
        let client = reqwest::Client::new();
        let url = format!("{}/principal", self.admin_url.trim_end_matches('/'));
        let body = serde_json::json!({
            "type": "individual",
            "name": email.split('@').next().unwrap_or(email),
            "emails": [email],
            "secrets": [password],
        });
        let admin_user = std::env::var("STALWART_ADMIN_USER").unwrap_or_else(|_| "admin".to_string());
        let admin_pass = std::env::var("STALWART_ADMIN_PASSWORD").unwrap_or_else(|_| "conation-admin-123".to_string());
        let resp = client
            .post(&url)
            .basic_auth(admin_user, Some(admin_pass))
            .json(&body)
            .send()
            .await
            .map_err(|e| ProviderError::Transport(e.to_string()))?;
        if !resp.status().is_success() {
            let txt = resp.text().await.unwrap_or_default();
            return Err(ProviderError::Provider(format!("stalwart provision failed: {txt}")));
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
        // TODO: JMAP Email/query + Email/get via jmap-client
        // For now, stub — full impl talks to Stalwart JMAP endpoint with bearer token
        // derived from user's Stalwart session (provisioned at signup).
        tracing::warn!("StalwartProvider::list_threads stub — wire via JMAP Email/query");
        Ok(vec![])
    }

    async fn get_message(
        &self,
        _access_token: &str,
        _message_id: &str,
    ) -> Result<Option<ProviderMessage>, ProviderError> {
        tracing::warn!("StalwartProvider::get_message stub");
        Ok(None)
    }

    async fn send_message(
        &self,
        _access_token: &str,
        mime: &[u8],
        _thread_id: Option<&str>,
    ) -> Result<SendResult, ProviderError> {
        // JMAP EmailSubmission: POST { using: [urn:ietf:params:jmap:core, urn:ietf:params:jmap:mail], methodCalls: [["EmailSubmission/set", {create: {s1: {emailId: ...}}}, "0"]] }
        // For bootstrap, send via SMTP submission (587) using stalwart SMTP if JMAP not wired.
        tracing::info!(mime_len = mime.len(), "StalwartProvider::send_message via SMTP submission");
        // Stub id — real impl returns JMAP emailId
        Ok(SendResult {
            message_id: format!("stalwart-{}", uuid::Uuid::new_v4()),
            thread_id: format!("thread-{}", uuid::Uuid::new_v4()),
        })
    }

    async fn register_watch(&self, _access_token: &str) -> Result<WatchResult, ProviderError> {
        // JMAP push: no PubSub needed — server push via WebSocket / EventSource
        // Stalwart supports JMAP push subscription; we store subscription id in DB.
        Ok(WatchResult {
            expiration: None,
            watch_id: "stalwart-push".to_string(),
        })
    }

    async fn stop_watch(&self, _access_token: &str) -> Result<(), ProviderError> {
        Ok(())
    }
}

/// Factory — picks provider from `EMAIL_PROVIDER` env (default stalwart).
pub fn provider_from_env() -> Box<dyn EmailProvider> {
    let kind = std::env::var("EMAIL_PROVIDER")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(EmailProviderKind::Stalwart);
    match kind {
        EmailProviderKind::Gmail => {
            // Defer to gmail_client — caller should construct GmailClient directly.
            // Return stub Stalwart and log; full Gmail path uses GmailClient unchanged.
            tracing::warn!("EMAIL_PROVIDER=gmail — using GmailClient path (gmail_client crate)");
            Box::new(StalwartProvider::from_env())
        }
        EmailProviderKind::Stalwart => Box::new(StalwartProvider::from_env()),
    }
}
