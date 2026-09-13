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

    conation_env_var::maybe_env_vars! {
        pub(super) struct EmailProvider;
        pub(super) struct StalwartToken;
        pub(super) struct StalwartUser;
        pub(super) struct StalwartPassword;
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

impl EmailProviderKind {
    /// Resolves the active backend from `EMAIL_PROVIDER`, then `STALWART_JMAP_URL`.
    ///
    /// An explicit `EMAIL_PROVIDER` value wins. Otherwise a configured Stalwart
    /// JMAP endpoint selects Stalwart. Gmail remains the default when neither is
    /// set, including when `EMAIL_PROVIDER=gmail`.
    #[must_use]
    pub fn from_env() -> Self {
        if let Some(value) = environment::EmailProvider::new() {
            if let Ok(kind) = value.as_ref().parse() {
                return kind;
            }
        }
        if environment::StalwartJmapUrl::new().is_ok() {
            Self::Stalwart
        } else {
            Self::Gmail
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

/// One Stalwart JMAP calendar event after `CalendarEvent/query` + `CalendarEvent/get`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StalwartCalendarEvent {
    /// JMAP calendar event id.
    pub id: String,
    /// JSCalendar `uid`, when present.
    pub uid: Option<String>,
    /// Display title.
    pub title: String,
    /// Optional description.
    pub description: Option<String>,
    /// Optional location label (first JSCalendar location name).
    pub location: Option<String>,
    /// Inclusive start in UTC.
    pub start: chrono::DateTime<chrono::Utc>,
    /// Duration in seconds (minimum 60).
    pub duration_secs: i64,
    /// IANA time zone from JSCalendar `timeZone`.
    pub time_zone: Option<String>,
    /// `true` when JSCalendar `freeBusyStatus` is `free`.
    pub free: bool,
    /// JSCalendar status (`confirmed`, `cancelled`, `tentative`).
    pub status: Option<String>,
    /// Participants mapped from JSCalendar `participants`.
    pub participants: Vec<StalwartParticipant>,
}

/// One JSCalendar participant on a Stalwart event.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StalwartParticipant {
    /// Mailbox address (`sendTo.imip` or `email`).
    pub email: String,
    /// Display name.
    pub name: Option<String>,
    /// JSCalendar `participationStatus` (`accepted`, `declined`, `tentative`, `needs-action`).
    pub participation_status: String,
    /// Optional attendance (`roles.optional`).
    pub is_optional: bool,
    /// JMAP participant map key, used when patching RSVP.
    pub participant_id: String,
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

    /// Creates a Stalwart Account/User through the JMAP management API.
    ///
    /// Uses `x:Account/set` (Stalwart v0.16) with the mailbox local-part, domain,
    /// password secret, and the User role. An existing mailbox is treated as
    /// success. Missing admin credentials or a failed JMAP session is an error:
    /// `/email/init` must not link an inbox that cannot receive mail.
    /// The removed `/api/principal` REST path is never called.
    pub async fn provision_account(
        &self,
        email: &str,
        password: &str,
    ) -> Result<(), ProviderError> {
        let auth = admin_auth_from_env()?;
        let session = self.admin_session_document(&auth).await?;
        let methods = management_set_methods(&session);
        if methods.is_empty() {
            return Err(ProviderError::Provider(
                "Stalwart JMAP session has no admin management capability".to_owned(),
            ));
        }

        let local_part = email.split_once('@').map_or(email, |(local, _)| local);
        let domain_name = email
            .split_once('@')
            .map(|(_, domain)| domain)
            .filter(|domain| !domain.is_empty())
            .ok_or_else(|| {
                ProviderError::Provider(format!("mailbox email is missing a domain: {email}"))
            })?;
        let domain_id = self
            .stalwart_domain_id(&session, &auth, domain_name)
            .await?;
        let mut arguments = json!({
            "create": {
                "account": {
                    "@type": "User",
                    "name": local_part,
                    "domainId": domain_id,
                    "credentials": {"0": {"@type": "Password", "secret": password}},
                    "memberGroupIds": {},
                    "roles": {"@type": "User"},
                    "permissions": {"@type": "Inherit"},
                    "quotas": {},
                    "aliases": {},
                }
            }
        });
        if let Some(account_id) = admin_account_id(&session) {
            arguments["accountId"] = json!(account_id);
        }

        let mut unknown_method = false;
        for (method, using) in methods {
            match self
                .admin_call(&session, &auth, using, method, arguments.clone())
                .await
            {
                Ok(body) => return provision_set_result(body),
                Err(error) if is_already_exists_error(&error) => return Ok(()),
                Err(error) if is_unknown_method(&error) => {
                    unknown_method = true;
                }
                Err(error) => return Err(error),
            }
        }
        if unknown_method {
            return Err(ProviderError::Provider(
                "Stalwart JMAP session has no admin management capability".to_owned(),
            ));
        }
        Err(ProviderError::Provider(
            "Stalwart mailbox provisioning returned no create result".to_owned(),
        ))
    }

    /// Downloads a JMAP blob, rejecting payloads larger than 256 KiB.
    pub async fn download_blob(
        &self,
        access_token: &str,
        blob_id: &str,
        name: Option<&str>,
    ) -> Result<Vec<u8>, ProviderError> {
        self.download_blob_up_to(access_token, blob_id, name, 262_144)
            .await
    }

    /// Downloads a JMAP blob, rejecting payloads larger than `max_bytes`.
    pub async fn download_blob_up_to(
        &self,
        access_token: &str,
        blob_id: &str,
        name: Option<&str>,
        max_bytes: usize,
    ) -> Result<Vec<u8>, ProviderError> {
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
            if len > max_bytes as u64 {
                return Err(ProviderError::Provider(format!(
                    "JMAP blob exceeds {max_bytes} bytes"
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
            if body.len().saturating_add(chunk.len()) > max_bytes {
                return Err(ProviderError::Provider(format!(
                    "JMAP blob exceeds {max_bytes} bytes"
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
const JMAP_MANAGEMENT: &str = "urn:stalwart:jmap";
const JMAP_PRINCIPAL: &str = "urn:ietf:params:jmap:principals";
const JMAP_ADMIN: &str = "urn:stalwart:params:jmap:admin";
const JMAP_CALENDARS: &str = "urn:ietf:params:jmap:calendars";

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
        let session = self.session_document(access_token).await?;
        if !session.capabilities.contains_key(JMAP_MAIL) {
            return Err(ProviderError::Provider(
                "JMAP session does not advertise mail capability".to_owned(),
            ));
        }
        Ok(session)
    }

    async fn session_document(&self, access_token: &str) -> Result<JmapSession, ProviderError> {
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

    async fn admin_session_document(&self, auth: &AdminAuth) -> Result<JmapSession, ProviderError> {
        let response = apply_admin_auth(self.client.get(self.session_url()?), auth)
            .send()
            .await
            .map_err(|error| ProviderError::Transport(error.to_string()))?;
        let response = checked_response(response).await?;
        let session = response
            .json::<JmapSession>()
            .await
            .map_err(|error| ProviderError::Provider(format!("invalid JMAP session: {error}")))?;
        self.validate_bearer_endpoint(&session.api_url, "apiUrl")?;
        Ok(session)
    }

    async fn admin_call(
        &self,
        session: &JmapSession,
        auth: &AdminAuth,
        using: Vec<&str>,
        method: &str,
        arguments: Value,
    ) -> Result<Value, ProviderError> {
        let response = apply_admin_auth(self.client.post(session.api_url.as_str()), auth)
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

    async fn jmap_method(
        &self,
        session: &JmapSession,
        access_token: &str,
        admin: Option<&AdminAuth>,
        using: Vec<&str>,
        method: &str,
        arguments: Value,
    ) -> Result<Value, ProviderError> {
        match admin {
            Some(auth) => {
                self.admin_call(session, auth, using, method, arguments)
                    .await
            }
            None => {
                self.call(session, access_token, using, method, arguments)
                    .await
            }
        }
    }

    async fn stalwart_account_id_for_email(
        &self,
        session: &JmapSession,
        auth: &AdminAuth,
        email: &str,
    ) -> Result<String, ProviderError> {
        let management_account_id = admin_account_id(session).ok_or_else(|| {
            ProviderError::Provider("JMAP session has no management account".to_owned())
        })?;
        let accounts = self
            .admin_call(
                session,
                auth,
                vec![JMAP_CORE, JMAP_MANAGEMENT],
                "x:Account/get",
                json!({
                    "accountId": management_account_id,
                    "ids": null,
                    "properties": ["id", "emailAddress"],
                }),
            )
            .await?;
        let needle = email.to_ascii_lowercase();
        accounts
            .get("list")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .find_map(|account| {
                let address = account
                    .get("emailAddress")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_ascii_lowercase();
                (address == needle)
                    .then(|| account.get("id").and_then(Value::as_str).map(str::to_owned))
                    .flatten()
            })
            .ok_or_else(|| {
                ProviderError::Provider(format!("Stalwart mailbox {email} does not exist"))
            })
    }

    fn mailbox_selector(token: &str) -> Option<&str> {
        let token = token.trim();
        if token.contains('@') && !token.contains(char::is_whitespace) && token.len() <= 320 {
            Some(token)
        } else {
            None
        }
    }

    async fn open_mailbox(
        &self,
        access_token: &str,
        fallback_email: Option<&str>,
    ) -> Result<(JmapSession, Option<AdminAuth>, String), ProviderError> {
        let selector = Self::mailbox_selector(access_token);
        if access_token.is_empty() || selector.is_some() {
            let auth = admin_auth_from_env()?;
            let session = self.admin_session_document(&auth).await?;
            if !session.capabilities.contains_key(JMAP_MAIL) {
                return Err(ProviderError::Provider(
                    "JMAP session does not advertise mail capability".to_owned(),
                ));
            }
            let email = selector
                .map(|value| value.to_ascii_lowercase())
                .or_else(|| fallback_email.map(str::to_ascii_lowercase))
                .ok_or_else(|| {
                    ProviderError::Provider("Stalwart mailbox email is required".to_owned())
                })?;
            let account_id = self
                .stalwart_account_id_for_email(&session, &auth, &email)
                .await?;
            Ok((session, Some(auth), account_id))
        } else {
            let session = self.session(access_token).await?;
            let account_id = Self::account_id(&session)?.to_owned();
            Ok((session, None, account_id))
        }
    }

    async fn stalwart_domain_id(
        &self,
        session: &JmapSession,
        auth: &AdminAuth,
        domain_name: &str,
    ) -> Result<String, ProviderError> {
        let account_id = admin_account_id(session).ok_or_else(|| {
            ProviderError::Provider("JMAP session has no management account".to_owned())
        })?;
        let query = self
            .admin_call(
                session,
                auth,
                vec![JMAP_CORE, JMAP_MANAGEMENT],
                "x:Domain/query",
                json!({ "accountId": account_id }),
            )
            .await?;
        let ids = query
            .get("ids")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        if ids.is_empty() {
            return Err(ProviderError::Provider(format!(
                "Stalwart has no domain objects; expected {domain_name}"
            )));
        }
        let domains = self
            .admin_call(
                session,
                auth,
                vec![JMAP_CORE, JMAP_MANAGEMENT],
                "x:Domain/get",
                json!({ "accountId": account_id, "ids": ids }),
            )
            .await?;
        domains
            .get("list")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .find_map(|domain| {
                (domain.get("name").and_then(Value::as_str) == Some(domain_name))
                    .then(|| domain.get("id").and_then(Value::as_str).map(str::to_owned))
                    .flatten()
            })
            .ok_or_else(|| {
                ProviderError::Provider(format!("Stalwart domain {domain_name} does not exist"))
            })
    }

    /// Create a timed event on the mailbox's default Stalwart calendar.
    pub async fn create_calendar_event(
        &self,
        mailbox_email: &str,
        title: &str,
        start: chrono::DateTime<chrono::Utc>,
        duration_secs: i64,
    ) -> Result<String, ProviderError> {
        let auth = admin_auth_from_env()?;
        let session = self.admin_session_document(&auth).await?;
        let account_id = self
            .stalwart_account_id_for_email(&session, &auth, mailbox_email)
            .await?;
        let calendars = self
            .admin_call(
                &session,
                &auth,
                vec![JMAP_CORE, JMAP_CALENDARS],
                "Calendar/get",
                json!({ "accountId": account_id }),
            )
            .await?;
        let calendar_id = calendars
            .get("list")
            .and_then(Value::as_array)
            .and_then(|list| {
                list.iter()
                    .find(|calendar| {
                        calendar.get("isDefault").and_then(Value::as_bool) == Some(true)
                    })
                    .or_else(|| list.first())
                    .and_then(|calendar| calendar.get("id").and_then(Value::as_str))
            })
            .ok_or_else(|| {
                ProviderError::Provider(format!("Stalwart mailbox {mailbox_email} has no calendar"))
            })?;
        let created = self
            .admin_call(
                &session,
                &auth,
                vec![JMAP_CORE, JMAP_CALENDARS],
                "CalendarEvent/set",
                json!({
                    "accountId": account_id,
                    "create": {
                        "e1": {
                            "calendarIds": { calendar_id: true },
                            "title": title,
                            "start": start.format("%Y-%m-%dT%H:%M:%S").to_string(),
                            "duration": format!("PT{}S", duration_secs.max(60)),
                            "timeZone": "UTC",
                        }
                    }
                }),
            )
            .await?;
        created
            .get("created")
            .and_then(|created| created.get("e1"))
            .and_then(|event| event.get("id"))
            .and_then(Value::as_str)
            .map(str::to_owned)
            .ok_or_else(|| {
                ProviderError::Provider(
                    "Stalwart CalendarEvent/set did not create an event".to_owned(),
                )
            })
    }

    /// Update a timed event on the mailbox's default Stalwart calendar.
    pub async fn update_calendar_event(
        &self,
        mailbox_email: &str,
        event_id: &str,
        title: &str,
        start: chrono::DateTime<chrono::Utc>,
        duration_secs: i64,
    ) -> Result<(), ProviderError> {
        let auth = admin_auth_from_env()?;
        let session = self.admin_session_document(&auth).await?;
        let account_id = self
            .stalwart_account_id_for_email(&session, &auth, mailbox_email)
            .await?;
        let mut patch = serde_json::Map::new();
        patch.insert(
            event_id.to_owned(),
            json!({
                "title": title,
                "start": start.format("%Y-%m-%dT%H:%M:%S").to_string(),
                "duration": format!("PT{}S", duration_secs.max(60)),
                "timeZone": "UTC",
            }),
        );
        let updated = self
            .admin_call(
                &session,
                &auth,
                vec![JMAP_CORE, JMAP_CALENDARS],
                "CalendarEvent/set",
                json!({
                    "accountId": account_id,
                    "update": patch,
                }),
            )
            .await?;
        if updated
            .get("notUpdated")
            .and_then(|value| value.get(event_id))
            .is_some()
        {
            return Err(ProviderError::Provider(
                "Stalwart CalendarEvent/set did not update the event".to_owned(),
            ));
        }
        Ok(())
    }

    /// Destroy a Stalwart calendar event. Missing events are treated as success.
    pub async fn delete_calendar_event(
        &self,
        mailbox_email: &str,
        event_id: &str,
    ) -> Result<(), ProviderError> {
        let auth = admin_auth_from_env()?;
        let session = self.admin_session_document(&auth).await?;
        let account_id = self
            .stalwart_account_id_for_email(&session, &auth, mailbox_email)
            .await?;
        self.admin_call(
            &session,
            &auth,
            vec![JMAP_CORE, JMAP_CALENDARS],
            "CalendarEvent/set",
            json!({
                "accountId": account_id,
                "destroy": [event_id],
            }),
        )
        .await?;
        Ok(())
    }

    /// Pull timed events from the mailbox via JMAP `CalendarEvent/query` then `CalendarEvent/get`.
    pub async fn list_calendar_events(
        &self,
        mailbox_email: &str,
    ) -> Result<Vec<StalwartCalendarEvent>, ProviderError> {
        let (session, auth, account_id) = self.open_calendar_account(mailbox_email).await?;
        let queried = self
            .admin_call(
                &session,
                &auth,
                vec![JMAP_CORE, JMAP_CALENDARS],
                "CalendarEvent/query",
                json!({
                    "accountId": account_id,
                    "limit": 100,
                }),
            )
            .await?;
        let ids: Vec<String> = queried
            .get("ids")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|id| id.as_str().map(str::to_owned))
            .collect();
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let got = self
            .admin_call(
                &session,
                &auth,
                vec![JMAP_CORE, JMAP_CALENDARS],
                "CalendarEvent/get",
                json!({
                    "accountId": account_id,
                    "ids": ids,
                    "properties": [
                        "id",
                        "uid",
                        "title",
                        "description",
                        "start",
                        "duration",
                        "timeZone",
                        "participants",
                        "locations",
                        "freeBusyStatus",
                        "status"
                    ],
                }),
            )
            .await?;
        let list = got.get("list").and_then(Value::as_array).ok_or_else(|| {
            ProviderError::Provider("JMAP CalendarEvent/get response has no list".to_owned())
        })?;
        Ok(list.iter().filter_map(parse_jmap_calendar_event).collect())
    }

    /// Fetch one calendar event by JMAP id.
    pub async fn get_calendar_event(
        &self,
        mailbox_email: &str,
        event_id: &str,
    ) -> Result<Option<StalwartCalendarEvent>, ProviderError> {
        let (session, auth, account_id) = self.open_calendar_account(mailbox_email).await?;
        let got = self
            .admin_call(
                &session,
                &auth,
                vec![JMAP_CORE, JMAP_CALENDARS],
                "CalendarEvent/get",
                json!({
                    "accountId": account_id,
                    "ids": [event_id],
                    "properties": [
                        "id",
                        "uid",
                        "title",
                        "description",
                        "start",
                        "duration",
                        "timeZone",
                        "participants",
                        "locations",
                        "freeBusyStatus",
                        "status"
                    ],
                }),
            )
            .await?;
        let list = got.get("list").and_then(Value::as_array).ok_or_else(|| {
            ProviderError::Provider("JMAP CalendarEvent/get response has no list".to_owned())
        })?;
        Ok(list.first().and_then(parse_jmap_calendar_event))
    }

    /// Set the matching participant's `participationStatus` via `CalendarEvent/set`.
    pub async fn rsvp_calendar_event(
        &self,
        mailbox_email: &str,
        event_id: &str,
        attendee_emails: &[&str],
        participation_status: &str,
    ) -> Result<StalwartCalendarEvent, ProviderError> {
        let mut event = self
            .get_calendar_event(mailbox_email, event_id)
            .await?
            .ok_or_else(|| {
                ProviderError::NotFound("Stalwart calendar event was not found".to_owned())
            })?;
        let needles: Vec<String> = attendee_emails
            .iter()
            .map(|email| email.to_ascii_lowercase())
            .collect();
        let participant_id = event
            .participants
            .iter()
            .find(|participant| needles.iter().any(|email| email == &participant.email))
            .map(|participant| participant.participant_id.clone())
            .ok_or_else(|| {
                ProviderError::NotFound(
                    "connected mailbox is not a participant on the Stalwart event".to_owned(),
                )
            })?;
        let (session, auth, account_id) = self.open_calendar_account(mailbox_email).await?;
        let mut patch = serde_json::Map::new();
        let path = format!("participants/{participant_id}/participationStatus");
        let mut fields = serde_json::Map::new();
        fields.insert(path, json!(participation_status));
        patch.insert(event_id.to_owned(), Value::Object(fields));
        let updated = self
            .admin_call(
                &session,
                &auth,
                vec![JMAP_CORE, JMAP_CALENDARS],
                "CalendarEvent/set",
                json!({
                    "accountId": account_id,
                    "update": patch,
                }),
            )
            .await?;
        if updated
            .get("notUpdated")
            .and_then(|value| value.get(event_id))
            .is_some()
        {
            return Err(ProviderError::Provider(
                "Stalwart CalendarEvent/set did not update the RSVP".to_owned(),
            ));
        }
        if let Some(participant) = event
            .participants
            .iter_mut()
            .find(|participant| participant.participant_id == participant_id)
        {
            participant.participation_status = participation_status.to_owned();
        }
        Ok(event)
    }

    async fn open_calendar_account(
        &self,
        mailbox_email: &str,
    ) -> Result<(JmapSession, AdminAuth, String), ProviderError> {
        let auth = admin_auth_from_env()?;
        let session = self.admin_session_document(&auth).await?;
        let account_id = self
            .stalwart_account_id_for_email(&session, &auth, mailbox_email)
            .await?;
        Ok((session, auth, account_id))
    }
}

fn parse_jmap_calendar_event(value: &Value) -> Option<StalwartCalendarEvent> {
    let id = value.get("id").and_then(Value::as_str)?.to_owned();
    let start = value
        .get("start")
        .and_then(Value::as_str)
        .and_then(parse_jmap_start)?;
    let duration_secs = value
        .get("duration")
        .and_then(Value::as_str)
        .map(parse_iso8601_duration_secs)
        .unwrap_or(60)
        .max(60);
    let time_zone = value
        .get("timeZone")
        .and_then(Value::as_str)
        .map(str::to_owned);
    Some(StalwartCalendarEvent {
        id,
        uid: value.get("uid").and_then(Value::as_str).map(str::to_owned),
        title: value
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("Untitled")
            .to_owned(),
        description: value
            .get("description")
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
            .map(str::to_owned),
        location: first_location_name(value),
        start,
        duration_secs,
        time_zone,
        free: value.get("freeBusyStatus").and_then(Value::as_str) == Some("free"),
        status: value
            .get("status")
            .and_then(Value::as_str)
            .map(str::to_owned),
        participants: parse_jmap_participants(value.get("participants")),
    })
}

fn parse_jmap_participants(value: Option<&Value>) -> Vec<StalwartParticipant> {
    let Some(object) = value.and_then(Value::as_object) else {
        return Vec::new();
    };
    object
        .iter()
        .filter_map(|(participant_id, participant)| {
            let email = participant_email(participant)?;
            Some(StalwartParticipant {
                email,
                name: participant
                    .get("name")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
                participation_status: participant
                    .get("participationStatus")
                    .and_then(Value::as_str)
                    .unwrap_or("needs-action")
                    .to_owned(),
                is_optional: participant
                    .get("roles")
                    .and_then(|roles| roles.get("optional"))
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
                participant_id: participant_id.clone(),
            })
        })
        .collect()
}

fn participant_email(participant: &Value) -> Option<String> {
    if let Some(email) = participant.get("email").and_then(Value::as_str) {
        let email = email
            .trim()
            .trim_start_matches("mailto:")
            .to_ascii_lowercase();
        if email.contains('@') {
            return Some(email);
        }
    }
    let imip = participant
        .get("sendTo")
        .and_then(|send_to| send_to.get("imip"))
        .and_then(Value::as_str)?;
    let email = imip
        .trim()
        .trim_start_matches("mailto:")
        .to_ascii_lowercase();
    email.contains('@').then_some(email)
}

fn first_location_name(value: &Value) -> Option<String> {
    value
        .get("locations")
        .and_then(Value::as_object)
        .and_then(|locations| {
            locations.values().find_map(|location| {
                location
                    .get("name")
                    .and_then(Value::as_str)
                    .filter(|name| !name.is_empty())
                    .map(str::to_owned)
            })
        })
}

fn parse_jmap_start(start: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    if let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(start) {
        return Some(parsed.with_timezone(&chrono::Utc));
    }
    chrono::NaiveDateTime::parse_from_str(start, "%Y-%m-%dT%H:%M:%S")
        .or_else(|_| chrono::NaiveDateTime::parse_from_str(start, "%Y-%m-%dT%H:%M:%S%.f"))
        .ok()
        .map(|naive| naive.and_utc())
}

fn parse_iso8601_duration_secs(value: &str) -> i64 {
    let bytes = value.as_bytes();
    if bytes.first() != Some(&b'P') {
        return 60;
    }
    let mut total = 0_i64;
    let mut number = 0_i64;
    let mut in_time = false;
    for byte in &bytes[1..] {
        match byte {
            b'T' => in_time = true,
            b'0'..=b'9' => {
                number = number
                    .saturating_mul(10)
                    .saturating_add(i64::from(byte - b'0'))
            }
            b'D' if !in_time => {
                total = total.saturating_add(number.saturating_mul(86_400));
                number = 0;
            }
            b'H' if in_time => {
                total = total.saturating_add(number.saturating_mul(3_600));
                number = 0;
            }
            b'M' if in_time => {
                total = total.saturating_add(number.saturating_mul(60));
                number = 0;
            }
            b'S' if in_time => {
                total = total.saturating_add(number);
                number = 0;
            }
            b'W' if !in_time => {
                total = total.saturating_add(number.saturating_mul(604_800));
                number = 0;
            }
            _ => return 60,
        }
    }
    if total == 0 {
        60
    } else {
        total
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
        let typ = arguments.get("type").and_then(Value::as_str).unwrap_or("");
        let description = arguments
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or("JMAP method failed");
        if typ.is_empty() {
            return Err(ProviderError::Provider(description.to_owned()));
        }
        return Err(ProviderError::Provider(format!("{typ}: {description}")));
    }
    if name != expected_method {
        return Err(ProviderError::Provider(format!(
            "expected JMAP {expected_method} response, got {name}"
        )));
    }
    Ok(arguments)
}

fn from_address_from_mime(mime: &[u8]) -> Result<String, ProviderError> {
    let text = std::str::from_utf8(mime)
        .map_err(|_| ProviderError::Provider("MIME message is not valid UTF-8".to_owned()))?;
    let headers = text.split("\r\n\r\n").next().unwrap_or(text);
    for line in headers.lines() {
        let Some(value) = line
            .strip_prefix("From:")
            .or_else(|| line.strip_prefix("from:"))
        else {
            continue;
        };
        if let Some(start) = value.rfind('<') {
            if let Some(end) = value[start + 1..].find('>') {
                let email = value[start + 1..start + 1 + end].trim();
                if email.contains('@') {
                    return Ok(email.to_ascii_lowercase());
                }
            }
        }
        let email = value.trim().trim_matches('"');
        if email.contains('@') {
            return Ok(email.to_ascii_lowercase());
        }
    }
    Err(ProviderError::Provider(
        "MIME message has no From address".to_owned(),
    ))
}

enum AdminAuth {
    Bearer(String),
    Basic { user: String, password: String },
}

fn admin_auth_from_env() -> Result<AdminAuth, ProviderError> {
    let token = environment::StalwartToken::new()
        .map(|value| value.as_ref().to_owned())
        .filter(|value| !value.is_empty());
    if let Some(token) = token {
        return Ok(AdminAuth::Bearer(token));
    }
    let user = environment::StalwartUser::new()
        .map(|value| value.as_ref().to_owned())
        .filter(|value| !value.is_empty());
    let password = environment::StalwartPassword::new()
        .map(|value| value.as_ref().to_owned())
        .filter(|value| !value.is_empty());
    match (user, password) {
        (Some(user), Some(password)) => Ok(AdminAuth::Basic { user, password }),
        _ => Err(ProviderError::Configuration(
            "STALWART_TOKEN or STALWART_USER/STALWART_PASSWORD required to provision mailboxes"
                .to_owned(),
        )),
    }
}

fn apply_admin_auth(request: reqwest::RequestBuilder, auth: &AdminAuth) -> reqwest::RequestBuilder {
    match auth {
        AdminAuth::Bearer(token) => request.bearer_auth(token),
        AdminAuth::Basic { user, password } => request.basic_auth(user, Some(password)),
    }
}

fn session_has_capability(session: &JmapSession, capability: &str) -> bool {
    session.capabilities.contains_key(capability)
        || session.primary_accounts.contains_key(capability)
        || session
            .accounts
            .values()
            .any(|account| account.account_capabilities.contains_key(capability))
}

fn management_set_methods(session: &JmapSession) -> Vec<(&'static str, Vec<&'static str>)> {
    let mut methods = Vec::new();
    if session_has_capability(session, JMAP_MANAGEMENT) {
        methods.push(("x:Account/set", vec![JMAP_CORE, JMAP_MANAGEMENT]));
        methods.push(("Account/set", vec![JMAP_CORE, JMAP_MANAGEMENT]));
    }
    if session_has_capability(session, JMAP_PRINCIPAL) {
        methods.push(("Principal/set", vec![JMAP_CORE, JMAP_PRINCIPAL]));
    } else if session_has_capability(session, JMAP_ADMIN) {
        methods.push(("Principal/set", vec![JMAP_CORE, JMAP_ADMIN]));
    }
    methods
}

fn admin_account_id(session: &JmapSession) -> Option<&str> {
    [JMAP_MANAGEMENT, JMAP_PRINCIPAL, JMAP_ADMIN, JMAP_CORE]
        .into_iter()
        .find_map(|capability| {
            session
                .primary_accounts
                .get(capability)
                .map(String::as_str)
                .filter(|id| !id.is_empty())
        })
        .or_else(|| {
            session.accounts.iter().find_map(|(id, account)| {
                (account.account_capabilities.contains_key(JMAP_MANAGEMENT)
                    || account.account_capabilities.contains_key(JMAP_PRINCIPAL)
                    || account.account_capabilities.contains_key(JMAP_ADMIN))
                .then_some(id.as_str())
            })
        })
}

fn provision_set_result(arguments: Value) -> Result<(), ProviderError> {
    if arguments
        .get("created")
        .and_then(Value::as_object)
        .is_some_and(|created| !created.is_empty())
    {
        return Ok(());
    }
    if let Some(not_created) = arguments.get("notCreated").and_then(Value::as_object) {
        if not_created.values().any(is_already_exists_value) {
            return Ok(());
        }
        let description = not_created
            .values()
            .find_map(|value| value.get("description").and_then(Value::as_str))
            .unwrap_or("JMAP account create failed");
        return Err(ProviderError::Provider(description.to_owned()));
    }
    Err(ProviderError::Provider(
        "JMAP account create returned no created mailbox".to_owned(),
    ))
}

fn is_already_exists_value(value: &Value) -> bool {
    let typ = value.get("type").and_then(Value::as_str).unwrap_or("");
    let description = value
        .get("description")
        .and_then(Value::as_str)
        .unwrap_or("");
    already_exists_text(typ) || already_exists_text(description)
}

fn is_already_exists_error(error: &ProviderError) -> bool {
    matches!(error, ProviderError::Provider(message) if already_exists_text(message))
}

fn is_unknown_method(error: &ProviderError) -> bool {
    match error {
        ProviderError::Provider(message) => {
            let lower = message.to_ascii_lowercase();
            lower.contains("unknownmethod") || lower.contains("unknown method")
        }
        _ => false,
    }
}

fn already_exists_text(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    lower.contains("alreadyexists") || lower.contains("already exist")
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
        let (session, admin, account_id) = self.open_mailbox(access_token, None).await?;
        let query = self
            .jmap_method(
                &session,
                access_token,
                admin.as_ref(),
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
            .jmap_method(
                &session,
                access_token,
                admin.as_ref(),
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
        let (session, admin, account_id) = self.open_mailbox(access_token, None).await?;
        let response = self
            .jmap_method(
                &session,
                access_token,
                admin.as_ref(),
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
        let from = from_address_from_mime(mime).ok();
        let (session, admin, account_id) = self.open_mailbox(access_token, from.as_deref()).await?;
        if !session.capabilities.contains_key(JMAP_SUBMISSION) {
            return Err(ProviderError::Provider(
                "JMAP session does not advertise submission capability".to_owned(),
            ));
        }
        let mailboxes = self
            .jmap_method(
                &session,
                access_token,
                admin.as_ref(),
                vec![JMAP_CORE, JMAP_MAIL],
                "Mailbox/get",
                json!({ "accountId": account_id, "properties": ["id", "role"] }),
            )
            .await?;
        let drafts_mailbox_id = mailboxes
            .get("list")
            .and_then(Value::as_array)
            .and_then(|mailboxes| {
                mailboxes.iter().find_map(|mailbox| {
                    (mailbox.get("role").and_then(Value::as_str) == Some("drafts"))
                        .then(|| mailbox.get("id").and_then(Value::as_str))
                        .flatten()
                })
            })
            .ok_or_else(|| {
                ProviderError::Provider("JMAP account has no Drafts mailbox".to_owned())
            })?
            .to_owned();
        let upload_url = session.upload_url.as_deref().ok_or_else(|| {
            ProviderError::Provider("JMAP session does not advertise uploadUrl".to_owned())
        })?;
        let upload_url = upload_url.replace("{accountId}", &account_id);
        let upload_url = Url::parse(&upload_url)
            .map_err(|error| ProviderError::Provider(format!("invalid JMAP uploadUrl: {error}")))?;
        self.validate_bearer_endpoint(&upload_url, "uploadUrl")?;
        let upload_request = self
            .client
            .post(upload_url)
            .header(reqwest::header::CONTENT_TYPE, "message/rfc822")
            .body(mime.to_vec());
        let upload_request = match admin.as_ref() {
            Some(auth) => apply_admin_auth(upload_request, auth),
            None => upload_request.bearer_auth(access_token),
        };
        let upload = upload_request
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
            .jmap_method(
                &session,
                access_token,
                admin.as_ref(),
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
            })?
            .to_owned();
        let identities = self
            .jmap_method(
                &session,
                access_token,
                admin.as_ref(),
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
            .jmap_method(
                &session,
                access_token,
                admin.as_ref(),
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
            .map(str::to_owned)
            .unwrap_or_else(|| email_id.clone());
        Ok(SendResult {
            message_id: email_id,
            thread_id,
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
    match EmailProviderKind::from_env() {
        EmailProviderKind::Gmail => Err(ProviderError::Unsupported(
            "Gmail remains on the gmail_client integration",
        )),
        EmailProviderKind::Stalwart => Ok(Box::new(StalwartProvider::from_env()?)),
    }
}
