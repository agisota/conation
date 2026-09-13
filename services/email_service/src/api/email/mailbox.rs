//! @conation.dev local-part checks for open signup.
//!
//! `available_handler` is public so /signup can pick a free address before
//! `/email/init`. Init reuses the same rules.

use crate::api::ApiContext;
use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use models_email::service::link::UserProvider;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, VecDeque},
    sync::{LazyLock, Mutex},
    time::{Duration, Instant},
};
use utoipa::{IntoParams, ToSchema};

#[cfg(test)]
mod test;

const MAILBOX_DOMAIN: &str = "conation.dev";
pub(crate) const AVAILABILITY_WINDOW: Duration = Duration::from_secs(60);
pub(crate) const AVAILABILITY_MAX_REQUESTS: usize = 30;

static AVAILABILITY_HITS: LazyLock<Mutex<HashMap<String, VecDeque<Instant>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
const RESERVED: &[&str] = &[
    "admin",
    "administrator",
    "postmaster",
    "abuse",
    "webmaster",
    "hostmaster",
    "mailer-daemon",
    "security",
    "support",
    "no-reply",
    "noreply",
    "root",
];

/// Query for `GET /email/mailbox/available`.
#[derive(Debug, Deserialize, IntoParams)]
pub struct AvailableQuery {
    /// Desired local-part (without `@conation.dev`).
    pub local: String,
}

/// Whether a `@conation.dev` local-part is free.
#[derive(Debug, Serialize, ToSchema)]
pub struct MailboxAvailableResponse {
    /// Normalized local-part.
    pub local: String,
    /// Full mailbox address.
    pub mailbox: String,
    /// True when no email_links row owns this Stalwart address.
    pub available: bool,
    /// Next candidate when `available` is false.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,
}

/// Public availability check used by open signup / onboarding.
#[utoipa::path(
    get,
    tag = "Init",
    path = "/email/mailbox/available",
    params(AvailableQuery),
    operation_id = "mailbox_available",
    responses(
        (status = 200, body = MailboxAvailableResponse),
        (status = 400, body = String),
        (status = 429, body = String),
        (status = 500, body = String),
    )
)]
#[tracing::instrument(skip(ctx, headers), fields(local=%query.local))]
pub async fn available_handler(
    State(ctx): State<ApiContext>,
    headers: HeaderMap,
    Query(query): Query<AvailableQuery>,
) -> Result<Json<MailboxAvailableResponse>, Response> {
    if !allow_mailbox_lookup(&client_key_from_headers(&headers)) {
        return Err((StatusCode::TOO_MANY_REQUESTS, "rate limited").into_response());
    }
    let local = match normalize_local_part(&query.local) {
        Ok(local) => local,
        Err(message) => return Err((StatusCode::BAD_REQUEST, message).into_response()),
    };
    let mailbox = address_for_local(&local);
    let taken = mailbox_taken(&ctx.db, &mailbox).await.map_err(|error| {
        tracing::error!(error=?error, "mailbox availability lookup failed");
        (StatusCode::INTERNAL_SERVER_ERROR, "unable to check mailbox").into_response()
    })?;
    let suggestion = if taken {
        Some(next_candidate(&local, 2))
    } else {
        None
    };
    Ok(Json(MailboxAvailableResponse {
        local,
        mailbox,
        available: !taken,
        suggestion,
    }))
}

/// Lowercase, strip, validate a user-chosen local-part.
pub fn normalize_local_part(raw: &str) -> Result<String, &'static str> {
    let local = raw.trim().to_ascii_lowercase();
    if local.is_empty() || local.len() > 64 {
        return Err("invalid mailbox local-part");
    }
    if !local.chars().all(|ch| {
        ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '.' || ch == '-' || ch == '_'
    }) {
        return Err("invalid mailbox local-part");
    }
    if local.starts_with('.')
        || local.ends_with('.')
        || local.starts_with('-')
        || local.ends_with('-')
        || local.contains("..")
    {
        return Err("invalid mailbox local-part");
    }
    if RESERVED.contains(&local.as_str()) {
        return Err("mailbox local-part is reserved");
    }
    Ok(local)
}

/// `{local}@conation.dev`.
pub fn address_for_local(local: &str) -> String {
    format!("{local}@{MAILBOX_DOMAIN}")
}

/// Default local-part from the confirmed external login email.
pub fn suggested_local_from_login(login_email: &str) -> String {
    match login_email.rsplit_once('@') {
        Some((_, host)) if host.eq_ignore_ascii_case(MAILBOX_DOMAIN) => login_email
            .rsplit_once('@')
            .map(|(local, _)| local.to_ascii_lowercase())
            .unwrap_or_else(|| login_email.to_ascii_lowercase()),
        Some((local, _)) if !local.is_empty() => local.to_ascii_lowercase(),
        _ => "user".to_string(),
    }
}

/// `alice`, then `alice2`, `alice3`, ...
pub fn next_candidate(local: &str, n: u32) -> String {
    if n <= 1 {
        local.to_string()
    } else {
        format!("{local}{n}")
    }
}

/// Rightmost `X-Forwarded-For` hop, or `"direct"` when the header is absent.
pub(crate) fn client_key_from_headers(headers: &HeaderMap) -> String {
    headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|chain| chain.split(',').next_back())
        .map(str::trim)
        .filter(|ip| !ip.is_empty())
        .unwrap_or("direct")
        .to_string()
}

pub(crate) fn allow_in(
    store: &Mutex<HashMap<String, VecDeque<Instant>>>,
    client_key: &str,
    now: Instant,
    max: usize,
    window: Duration,
) -> bool {
    let mut map = store
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let hits = map.entry(client_key.to_string()).or_default();
    while hits
        .front()
        .is_some_and(|hit| now.saturating_duration_since(*hit) >= window)
    {
        hits.pop_front();
    }
    if hits.len() >= max {
        return false;
    }
    hits.push_back(now);
    true
}

/// Cheap per-client sliding window so the public availability GET cannot be scraped freely.
pub(crate) fn allow_mailbox_lookup(client_key: &str) -> bool {
    allow_in(
        &AVAILABILITY_HITS,
        client_key,
        Instant::now(),
        AVAILABILITY_MAX_REQUESTS,
        AVAILABILITY_WINDOW,
    )
}

/// True when a Stalwart `email_links` row already owns this address.
pub async fn mailbox_taken(pool: &sqlx::PgPool, mailbox: &str) -> anyhow::Result<bool> {
    let link =
        email_db_client::links::get::fetch_link_by_email(pool, mailbox, UserProvider::Stalwart)
            .await?;
    Ok(link.is_some())
}
