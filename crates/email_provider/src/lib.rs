//! Experimental email-provider abstraction for Conation.
//! Supports two backends:
//! - `GmailProvider` — legacy Gmail API via `gmail_client` (kept for connected Gmail accounts)
//! - `StalwartProvider` — a self-hosted Stalwart JMAP client
//!
//! The Stalwart read and submission paths use the standard JMAP protocol.
//! Push/watch and product-level composition remain deliberately fail closed.

#![deny(missing_docs)]

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use url::Url;

#[cfg(test)]
mod test;

mod environment {
    conation_env_var::env_vars! {
        pub(super) struct StalwartJmapUrl;
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
    /// Self-hosted Stalwart JMAP backend for Conation deployments.
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
    /// Short preview of the message body (JMAP `preview`)
    pub snippet: Option<String>,
    /// Plain-text body from JMAP `bodyValues` (first `text/plain` part)
    #[serde(default)]
    pub body_text: Option<String>,
    /// HTML body from JMAP `bodyValues` (first `text/html` part)
    #[serde(default)]
    pub body_html: Option<String>,
    /// Attachment metadata from JMAP `attachments` (name, type, size, blobId)
    #[serde(default)]
    pub attachments: Vec<ProviderAttachment>,
}

/// Provider-agnostic attachment metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderAttachment {
    /// JMAP `blobId` used to fetch the attachment bytes
    pub blob_id: String,
    /// Filename from JMAP `name`
    pub name: Option<String>,
    /// MIME type from JMAP `type`
    pub mime_type: String,
    /// Size in bytes from JMAP `size`
    pub size: u64,
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
    client: reqwest::Client,
}

impl std::fmt::Debug for StalwartProvider {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("StalwartProvider")
            .field("jmap_url", &self.jmap_url)
            .finish()
    }
}

impl StalwartProvider {
    /// Creates a Stalwart JMAP provider.
    #[must_use]
    pub fn new(jmap_url: Url) -> Self {
        Self {
            jmap_url,
            client: reqwest::Client::new(),
        }
    }

    /// Loads the JMAP endpoint through the repository environment wrapper.
    pub fn from_env() -> Result<Self, ProviderError> {
        let jmap_url = environment::StalwartJmapUrl::new()
            .map_err(|error| ProviderError::Configuration(error.to_string()))?;
        Ok(Self::new(Url::parse(jmap_url.as_ref()).map_err(
            |error| ProviderError::Configuration(error.to_string()),
        )?))
    }

    /// Refuses the removed pre-v0.16 principal provisioning path.
    ///
    /// Stalwart v0.16 manages accounts through its JMAP management API. Conation
    /// provisions the fixed support mailboxes through the explicit operator CLI
    /// recipe; runtime signup provisioning is not wired yet.
    pub async fn provision_account(
        &self,
        email: &str,
        password: &str,
    ) -> Result<(), ProviderError> {
        let _ = (email, password);
        Err(ProviderError::Unsupported(
            "Stalwart v0.16 runtime account provisioning is not wired; use the explicit operator CLI recipe",
        ))
    }

    /// Downloads a JMAP blob, rejecting payloads larger than 256 KiB.
    pub async fn download_blob(
        &self,
        access_token: &str,
        blob_id: &str,
        name: Option<&str>,
    ) -> Result<Vec<u8>, ProviderError> {
        const MAX_BLOB_BYTES: usize = 262_144;
        let session = self.session(access_token).await?;
        let account_id = Self::account_id(&session)?;
        let download_url = session.download_url.as_deref().ok_or_else(|| {
            ProviderError::Provider("JMAP session does not advertise downloadUrl".to_owned())
        })?;
        let download_url = download_url
            .replace("{accountId}", account_id)
            .replace("{blobId}", blob_id)
            .replace("{name}", name.unwrap_or(""));
        let download_url = Url::parse(&download_url).map_err(|error| {
            ProviderError::Provider(format!("invalid JMAP downloadUrl: {error}"))
        })?;
        self.validate_bearer_endpoint(&download_url, "downloadUrl")?;
        let response = self
            .client
            .get(download_url)
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|error| ProviderError::Transport(error.to_string()))?;
        let mut response = checked_response(response).await?;
        if let Some(len) = response
            .headers()
            .get(reqwest::header::CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok())
        {
            if len > MAX_BLOB_BYTES as u64 {
                return Err(ProviderError::Provider(format!(
                    "JMAP blob exceeds {MAX_BLOB_BYTES} bytes"
                )));
            }
        }
        let mut body = Vec::new();
        loop {
            let chunk = response
                .chunk()
                .await
                .map_err(|error| ProviderError::Transport(error.to_string()))?;
            let Some(chunk) = chunk else {
                break;
            };
            if body.len().saturating_add(chunk.len()) > MAX_BLOB_BYTES {
                return Err(ProviderError::Provider(format!(
                    "JMAP blob exceeds {MAX_BLOB_BYTES} bytes"
                )));
            }
            body.extend_from_slice(&chunk);
        }
        Ok(body)
    }
}

const JMAP_CORE: &str = "urn:ietf:params:jmap:core";
const JMAP_MAIL: &str = "urn:ietf:params:jmap:mail";
const JMAP_SUBMISSION: &str = "urn:ietf:params:jmap:submission";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JmapSession {
    api_url: Url,
    upload_url: Option<String>,
    download_url: Option<String>,
    capabilities: HashMap<String, Value>,
    accounts: HashMap<String, JmapAccount>,
    primary_accounts: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JmapAccount {
    account_capabilities: HashMap<String, Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JmapEmail {
    id: String,
    thread_id: String,
    subject: Option<String>,
    from: Option<Vec<JmapAddress>>,
    to: Option<Vec<JmapAddress>>,
    received_at: Option<chrono::DateTime<chrono::Utc>>,
    has_attachment: bool,
    keywords: HashMap<String, bool>,
    preview: Option<String>,
    #[serde(default)]
    text_body: Vec<JmapBodyPart>,
    #[serde(default)]
    html_body: Vec<JmapBodyPart>,
    #[serde(default)]
    body_values: HashMap<String, JmapBodyValue>,
    #[serde(default)]
    attachments: Vec<JmapBodyPart>,
}

#[derive(Debug, Deserialize)]
struct JmapAddress {
    email: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JmapBodyPart {
    part_id: Option<String>,
    #[serde(rename = "type", default)]
    content_type: Option<String>,
    blob_id: Option<String>,
    name: Option<String>,
    #[serde(default)]
    size: u64,
}

#[derive(Debug, Deserialize)]
struct JmapBodyValue {
    value: String,
}

fn content_type_matches(ty: &str, mime: &str) -> bool {
    ty.split(';')
        .next()
        .unwrap_or(ty)
        .trim()
        .eq_ignore_ascii_case(mime)
}

fn first_body_value(
    parts: &[JmapBodyPart],
    body_values: &HashMap<String, JmapBodyValue>,
    mime: &str,
) -> Option<String> {
    parts.iter().find_map(|part| {
        let ty = part.content_type.as_deref().unwrap_or(mime);
        if !content_type_matches(ty, mime) {
            return None;
        }
        part.part_id
            .as_ref()
            .and_then(|id| body_values.get(id))
            .map(|body| body.value.clone())
    })
}

impl From<JmapEmail> for ProviderMessage {
    fn from(value: JmapEmail) -> Self {
        let body_text = first_body_value(&value.text_body, &value.body_values, "text/plain");
        let body_html = first_body_value(&value.html_body, &value.body_values, "text/html");
        Self {
            id: value.id,
            thread_id: value.thread_id,
            subject: value.subject,
            from: value
                .from
                .and_then(|addresses| addresses.into_iter().next().map(|address| address.email)),
            to: value
                .to
                .unwrap_or_default()
                .into_iter()
                .map(|address| address.email)
                .collect(),
            date: value.received_at,
            has_attachments: value.has_attachment,
            labels: value
                .keywords
                .into_iter()
                .filter_map(|(keyword, enabled)| enabled.then_some(keyword))
                .collect(),
            snippet: value.preview,
            body_text,
            body_html,
            attachments: value
                .attachments
                .into_iter()
                .filter_map(|part| {
                    let blob_id = part.blob_id?;
                    Some(ProviderAttachment {
                        blob_id,
                        name: part.name,
                        mime_type: part
                            .content_type
                            .unwrap_or_else(|| "application/octet-stream".to_owned()),
                        size: part.size,
                    })
                })
                .collect(),
        }
    }
}

impl StalwartProvider {
    fn session_url(&self) -> Result<Url, ProviderError> {
        let mut url = self.jmap_url.clone();
        if !url.username().is_empty() || url.password().is_some() {
            return Err(ProviderError::Configuration(
                "STALWART_JMAP_URL must not contain credentials".to_owned(),
            ));
        }
        match url.path() {
            "" | "/" => url.set_path("/jmap/session"),
            "/jmap" | "/jmap/" => url.set_path("/jmap/session"),
            _ => {}
        }
        Ok(url)
    }

    async fn session(&self, access_token: &str) -> Result<JmapSession, ProviderError> {
        let response = self
            .client
            .get(self.session_url()?)
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|error| ProviderError::Transport(error.to_string()))?;
        let response = checked_response(response).await?;
        let session = response
            .json::<JmapSession>()
            .await
            .map_err(|error| ProviderError::Provider(format!("invalid JMAP session: {error}")))?;
        self.validate_bearer_endpoint(&session.api_url, "apiUrl")?;
        if !session.capabilities.contains_key(JMAP_MAIL) {
            return Err(ProviderError::Provider(
                "JMAP session does not advertise mail capability".to_owned(),
            ));
        }
        Ok(session)
    }

    fn validate_bearer_endpoint(
        &self,
        endpoint: &Url,
        property: &'static str,
    ) -> Result<(), ProviderError> {
        let same_origin = endpoint.scheme() == self.jmap_url.scheme()
            && endpoint.host_str() == self.jmap_url.host_str()
            && endpoint.port_or_known_default() == self.jmap_url.port_or_known_default();
        if !same_origin || !endpoint.username().is_empty() || endpoint.password().is_some() {
            return Err(ProviderError::Configuration(format!(
                "JMAP session {property} must use the configured Stalwart origin"
            )));
        }
        Ok(())
    }

    fn account_id(session: &JmapSession) -> Result<&str, ProviderError> {
        session
            .primary_accounts
            .get(JMAP_MAIL)
            .map(String::as_str)
            .or_else(|| {
                session
                    .accounts
                    .iter()
                    .find(|(_, account)| account.account_capabilities.contains_key(JMAP_MAIL))
                    .map(|(id, _)| id.as_str())
            })
            .ok_or_else(|| ProviderError::Provider("JMAP session has no mail account".to_owned()))
    }

    async fn call(
        &self,
        session: &JmapSession,
        access_token: &str,
        using: Vec<&str>,
        method: &str,
        arguments: Value,
    ) -> Result<Value, ProviderError> {
        let response = self
            .client
            .post(session.api_url.as_str())
            .bearer_auth(access_token)
            .json(&json!({
                "using": using,
                "methodCalls": [[method, arguments, "c1"]],
            }))
            .send()
            .await
            .map_err(|error| ProviderError::Transport(error.to_string()))?;
        let response = checked_response(response).await?;
        let body = response
            .json::<Value>()
            .await
            .map_err(|error| ProviderError::Provider(format!("invalid JMAP response: {error}")))?;
        method_response(body, method)
    }

    async fn drafts_mailbox_id(
        &self,
        session: &JmapSession,
        access_token: &str,
        account_id: &str,
    ) -> Result<String, ProviderError> {
        let mailboxes = self
            .call(
                session,
                access_token,
                vec![JMAP_CORE, JMAP_MAIL],
                "Mailbox/get",
                json!({ "accountId": account_id, "properties": ["id", "role"] }),
            )
            .await?;
        mailboxes
            .get("list")
            .and_then(Value::as_array)
            .and_then(|mailboxes| {
                mailboxes.iter().find_map(|mailbox| {
                    (mailbox.get("role").and_then(Value::as_str) == Some("drafts"))
                        .then(|| mailbox.get("id").and_then(Value::as_str))
                        .flatten()
                })
            })
            .map(str::to_owned)
            .ok_or_else(|| ProviderError::Provider("JMAP account has no Drafts mailbox".to_owned()))
    }
}

async fn checked_response(response: reqwest::Response) -> Result<reqwest::Response, ProviderError> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    let detail = response.text().await.unwrap_or_default();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(ProviderError::Auth(redact_detail(&detail)));
    }
    if status == reqwest::StatusCode::NOT_FOUND {
        return Err(ProviderError::NotFound(redact_detail(&detail)));
    }
    Err(ProviderError::Transport(format!("HTTP {status}")))
}

fn redact_detail(detail: &str) -> String {
    if detail.is_empty() {
        "request rejected".to_owned()
    } else {
        "request rejected by mail server".to_owned()
    }
}

fn method_response(body: Value, expected_method: &str) -> Result<Value, ProviderError> {
    let calls = body
        .get("methodResponses")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            ProviderError::Provider("JMAP response has no methodResponses".to_owned())
        })?;
    let call = calls.first().and_then(Value::as_array).ok_or_else(|| {
        ProviderError::Provider("JMAP response has an invalid method response".to_owned())
    })?;
    let name = call.first().and_then(Value::as_str).ok_or_else(|| {
        ProviderError::Provider("JMAP response method name is missing".to_owned())
    })?;
    let arguments = call.get(1).cloned().ok_or_else(|| {
        ProviderError::Provider("JMAP response method arguments are missing".to_owned())
    })?;
    if name == "error" {
        let description = arguments
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or("JMAP method failed");
        return Err(ProviderError::Provider(description.to_owned()));
    }
    if name != expected_method {
        return Err(ProviderError::Provider(format!(
            "expected JMAP {expected_method} response, got {name}"
        )));
    }
    Ok(arguments)
}

#[async_trait]
impl EmailProvider for StalwartProvider {
    fn kind(&self) -> EmailProviderKind {
        EmailProviderKind::Stalwart
    }

    async fn list_threads(
        &self,
        access_token: &str,
        max_results: u32,
        page_token: Option<&str>,
    ) -> Result<Vec<ProviderMessage>, ProviderError> {
        let position = page_token
            .map(|token| {
                token.parse::<u32>().map_err(|_| {
                    ProviderError::Provider("JMAP page token must be a numeric position".to_owned())
                })
            })
            .transpose()?
            .unwrap_or(0);
        let session = self.session(access_token).await?;
        let account_id = Self::account_id(&session)?;
        let query = self
            .call(
                &session,
                access_token,
                vec![JMAP_CORE, JMAP_MAIL],
                "Email/query",
                json!({
                    "accountId": account_id,
                    "collapseThreads": true,
                    "position": position,
                    "limit": max_results,
                    "sort": [{ "property": "receivedAt", "isAscending": false }],
                }),
            )
            .await?;
        let ids = query.get("ids").and_then(Value::as_array).ok_or_else(|| {
            ProviderError::Provider("JMAP Email/query response has no ids".to_owned())
        })?;
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let messages = self
            .call(
                &session,
                access_token,
                vec![JMAP_CORE, JMAP_MAIL],
                "Email/get",
                json!({
                    "accountId": account_id,
                    "ids": ids,
                    "fetchTextBodyValues": true,
                    "fetchHTMLBodyValues": true,
                    "properties": ["id", "threadId", "subject", "from", "to", "receivedAt", "hasAttachment", "keywords", "preview", "textBody", "htmlBody", "bodyValues", "attachments"],
                }),
            )
            .await?;
        let list = messages.get("list").cloned().ok_or_else(|| {
            ProviderError::Provider("JMAP Email/get response has no list".to_owned())
        })?;
        serde_json::from_value::<Vec<JmapEmail>>(list)
            .map(|emails| emails.into_iter().map(ProviderMessage::from).collect())
            .map_err(|error| ProviderError::Provider(format!("invalid JMAP email: {error}")))
    }

    async fn get_message(
        &self,
        access_token: &str,
        message_id: &str,
    ) -> Result<Option<ProviderMessage>, ProviderError> {
        let session = self.session(access_token).await?;
        let account_id = Self::account_id(&session)?;
        let response = self
            .call(
                &session,
                access_token,
                vec![JMAP_CORE, JMAP_MAIL],
                "Email/get",
                json!({
                    "accountId": account_id,
                    "ids": [message_id],
                    "fetchTextBodyValues": true,
                    "fetchHTMLBodyValues": true,
                    "properties": ["id", "threadId", "subject", "from", "to", "receivedAt", "hasAttachment", "keywords", "preview", "textBody", "htmlBody", "bodyValues", "attachments"],
                }),
            )
            .await?;
        let list = response.get("list").cloned().ok_or_else(|| {
            ProviderError::Provider("JMAP Email/get response has no list".to_owned())
        })?;
        let mut messages = serde_json::from_value::<Vec<JmapEmail>>(list)
            .map_err(|error| ProviderError::Provider(format!("invalid JMAP email: {error}")))?;
        Ok(messages.pop().map(ProviderMessage::from))
    }

    async fn send_message(
        &self,
        access_token: &str,
        mime: &[u8],
        _thread_id: Option<&str>,
    ) -> Result<SendResult, ProviderError> {
        let session = self.session(access_token).await?;
        if !session.capabilities.contains_key(JMAP_SUBMISSION) {
            return Err(ProviderError::Provider(
                "JMAP session does not advertise submission capability".to_owned(),
            ));
        }
        let account_id = Self::account_id(&session)?.to_owned();
        let drafts_mailbox_id = self
            .drafts_mailbox_id(&session, access_token, &account_id)
            .await?;
        let upload_url = session.upload_url.as_deref().ok_or_else(|| {
            ProviderError::Provider("JMAP session does not advertise uploadUrl".to_owned())
        })?;
        let upload_url = upload_url.replace("{accountId}", &account_id);
        let upload_url = Url::parse(&upload_url)
            .map_err(|error| ProviderError::Provider(format!("invalid JMAP uploadUrl: {error}")))?;
        self.validate_bearer_endpoint(&upload_url, "uploadUrl")?;
        let upload = self
            .client
            .post(upload_url)
            .bearer_auth(access_token)
            .header(reqwest::header::CONTENT_TYPE, "message/rfc822")
            .body(mime.to_vec())
            .send()
            .await
            .map_err(|error| ProviderError::Transport(error.to_string()))?;
        let upload = checked_response(upload).await?;
        let upload = upload.json::<Value>().await.map_err(|error| {
            ProviderError::Provider(format!("invalid JMAP upload response: {error}"))
        })?;
        let blob_id = upload
            .get("blobId")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                ProviderError::Provider("JMAP upload response has no blobId".to_owned())
            })?;
        let imported = self
            .call(
                &session,
                access_token,
                vec![JMAP_CORE, JMAP_MAIL],
                "Email/import",
                json!({
                    "accountId": account_id,
                    "emails": { "draft": { "blobId": blob_id, "mailboxIds": { (drafts_mailbox_id): true }, "keywords": { "$draft": true } } },
                }),
            )
            .await?;
        let email_id = imported
            .get("created")
            .and_then(|created| created.get("draft"))
            .and_then(|draft| draft.get("id"))
            .and_then(Value::as_str)
            .ok_or_else(|| {
                ProviderError::Provider("JMAP Email/import did not create an email".to_owned())
            })?;
        let identities = self
            .call(
                &session,
                access_token,
                vec![JMAP_CORE, JMAP_MAIL, JMAP_SUBMISSION],
                "Identity/get",
                json!({ "accountId": account_id, "properties": ["id"] }),
            )
            .await?;
        let identity_id = identities
            .get("list")
            .and_then(Value::as_array)
            .and_then(|identities| identities.first())
            .and_then(|identity| identity.get("id"))
            .and_then(Value::as_str)
            .ok_or_else(|| {
                ProviderError::Provider("JMAP account has no sending identity".to_owned())
            })?;
        let submitted = self
            .call(
                &session,
                access_token,
                vec![JMAP_CORE, JMAP_MAIL, JMAP_SUBMISSION],
                "EmailSubmission/set",
                json!({
                    "accountId": account_id,
                    "create": { "submission": { "emailId": email_id, "identityId": identity_id } },
                    "onSuccessUpdateEmail": { "#submission": { "keywords/$draft": null } },
                }),
            )
            .await?;
        let submission = submitted
            .get("created")
            .and_then(|created| created.get("submission"))
            .ok_or_else(|| {
                ProviderError::Provider(
                    "JMAP EmailSubmission/set did not create a submission".to_owned(),
                )
            })?;
        let _submission_id = submission
            .get("id")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                ProviderError::Provider("JMAP submission response has no id".to_owned())
            })?;
        let thread_id = submission
            .get("threadId")
            .and_then(Value::as_str)
            .unwrap_or(email_id);
        Ok(SendResult {
            message_id: email_id.to_owned(),
            thread_id: thread_id.to_owned(),
        })
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
