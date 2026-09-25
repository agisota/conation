//! Read-only JMAP mailbox verification. This does not create an account, persist
//! an email link, initialize sync, or prove external mail delivery.
use std::{collections::HashMap, time::Duration};

use serde::Deserialize;
use thiserror::Error;
use url::Url;

const MAIL_CAPABILITY: &str = "urn:ietf:params:jmap:mail";
const MAX_SESSION_BYTES: usize = 64 * 1024;

#[cfg(test)]
#[path = "stalwart_jmap_test.rs"]
mod test;

#[derive(Debug, Error)]
pub enum MailboxVerificationError {
    #[error("JMAP session URL or mailbox password is not configured")]
    Unconfigured,
    #[error("JMAP session URL must be HTTPS without embedded credentials")]
    InvalidEndpoint,
    #[error("JMAP mailbox password was rejected")]
    Unauthorized,
    #[error("JMAP session does not identify the requested personal mail account")]
    IdentityMismatch,
    #[error("JMAP session is unavailable or invalid")]
    ProviderUnavailable,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JmapSession {
    username: String,
    primary_accounts: HashMap<String, String>,
    accounts: HashMap<String, JmapAccount>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JmapAccount {
    is_personal: bool,
    account_capabilities: HashMap<String, serde_json::Value>,
}

impl JmapSession {
    fn primary_mailbox(&self, expected_email: &str) -> Option<&str> {
        // RFC 8620 permits an empty username, and Stalwart may return the
        // local part. The Basic login below is always the full requested email.
        let local_part = expected_email.split_once('@')?.0;
        if !self.username.is_empty()
            && self.username != expected_email
            && self.username != local_part
        {
            return None;
        }
        let account_id = self.primary_accounts.get(MAIL_CAPABILITY)?;
        let account = self.accounts.get(account_id)?;
        (account.is_personal && account.account_capabilities.contains_key(MAIL_CAPABILITY))
            .then_some(account_id.as_str())
    }
}

fn validate_session_url(raw: &str) -> Result<Url, MailboxVerificationError> {
    let url = Url::parse(raw).map_err(|_| MailboxVerificationError::InvalidEndpoint)?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(MailboxVerificationError::InvalidEndpoint);
    }
    Ok(url)
}

/// Verify an already-created personal mailbox using that user's own password
/// over HTTPS Basic authentication. Stalwart's management API key and OAuth
/// bearer tokens are not mailbox passwords. The full requested email is the
/// authenticated login; a different nonempty JMAP session identity is rejected.
/// The password is not logged, saved, or returned. Only the personal mail
/// account ID is returned; no account is linked or provisioned.
pub async fn verify_existing_mailbox(
    session_url: Option<&str>,
    password: &str,
    expected_email: &str,
) -> Result<String, MailboxVerificationError> {
    let session_url = session_url
        .filter(|value| !value.trim().is_empty())
        .ok_or(MailboxVerificationError::Unconfigured)
        .and_then(validate_session_url)?;
    if password.trim().is_empty() || expected_email.trim().is_empty() {
        return Err(MailboxVerificationError::Unconfigured);
    }

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| MailboxVerificationError::ProviderUnavailable)?;
    let mut response = client
        .get(session_url)
        .basic_auth(expected_email, Some(password))
        .send()
        .await
        .map_err(|_| MailboxVerificationError::ProviderUnavailable)?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED
        || response.status() == reqwest::StatusCode::FORBIDDEN
    {
        return Err(MailboxVerificationError::Unauthorized);
    }
    if !response.status().is_success() {
        return Err(MailboxVerificationError::ProviderUnavailable);
    }

    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| MailboxVerificationError::ProviderUnavailable)?
    {
        if chunk.len() > MAX_SESSION_BYTES - body.len() {
            return Err(MailboxVerificationError::ProviderUnavailable);
        }
        body.extend_from_slice(&chunk);
    }
    let session: JmapSession = serde_json::from_slice(&body)
        .map_err(|_| MailboxVerificationError::ProviderUnavailable)?;
    session
        .primary_mailbox(expected_email)
        .map(str::to_owned)
        .ok_or(MailboxVerificationError::IdentityMismatch)
}
