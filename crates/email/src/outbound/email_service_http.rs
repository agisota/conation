use std::time::Duration;

use reqwest::StatusCode;

use crate::domain::ports::{FirstInboxProvisionOutcome, FirstInboxProvisioner};

#[cfg(test)]
mod test;

const INIT_TIMEOUT: Duration = Duration::from_secs(10);

/// HTTP adapter for the email service's user-facing API, authenticated as the
/// user via a bearer token. Lets other services drive email flows through the
/// same routes and authorization the user's own client would use.
#[derive(Clone, Debug)]
pub struct EmailServiceHttpClient {
    url: String,
    client: reqwest::Client,
}

impl EmailServiceHttpClient {
    /// Creates a client rooted at the email service base url.
    pub fn new(url: String) -> Self {
        Self {
            url,
            client: reqwest::Client::new(),
        }
    }
}

fn classify_init_response(status: StatusCode, body: &[u8]) -> Option<FirstInboxProvisionOutcome> {
    if status.is_success() {
        Some(FirstInboxProvisionOutcome::Provisioned)
    } else if status == StatusCode::BAD_REQUEST
        && serde_json::from_slice::<serde_json::Value>(body)
            .ok()
            .and_then(|value| value.get("code")?.as_str().map(str::to_owned))
            .as_deref()
            == Some("ALREADY_INITIALIZED")
    {
        Some(FirstInboxProvisionOutcome::Skipped)
    } else {
        None
    }
}

fn classify_init_status(status: StatusCode) -> Option<FirstInboxProvisionOutcome> {
    classify_init_response(status, b"")
}

impl FirstInboxProvisioner for EmailServiceHttpClient {
    /// `POST /email/init`. Only an existing inbox is a successful no-op.
    /// A missing Gmail grant does not imply a mailbox exists.
    async fn provision_first_inbox(
        &self,
        access_token: &str,
    ) -> anyhow::Result<FirstInboxProvisionOutcome> {
        let res = self
            .client
            .post(format!("{}/email/init", self.url))
            .bearer_auth(access_token)
            .timeout(INIT_TIMEOUT)
            .send()
            .await?;

        let status = res.status();
        if status == StatusCode::BAD_REQUEST {
            let body = res.bytes().await?;
            return match classify_init_response(status, &body) {
                Some(outcome) => Ok(outcome),
                None => {
                    let code = serde_json::from_slice::<serde_json::Value>(&body)
                        .ok()
                        .and_then(|value| value.get("code")?.as_str().map(str::to_owned))
                        .unwrap_or_else(|| "UNKNOWN_INIT_ERROR".to_owned());
                    anyhow::bail!("HTTP {status}: {code}")
                }
            };
        }
        match classify_init_status(status) {
            Some(outcome) => Ok(outcome),
            None => anyhow::bail!("HTTP {status}: email init failed"),
        }
    }
}
