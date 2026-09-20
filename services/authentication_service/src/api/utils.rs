use crate::api::context::ApiContext;
use anyhow::Context;
use macro_auth::constant::{CONATION_ACCESS_TOKEN_COOKIE, CONATION_REFRESH_TOKEN_COOKIE};
use macro_env::Environment;
use macro_env_var::maybe_env_vars;
use cookie::{Cookie, SameSite};
use email::domain::ports::{FirstInboxProvisionOutcome, FirstInboxProvisioner};
use rand::{Rng, seq::SliceRandom};
use url::Url;

#[cfg(test)]
mod test;

maybe_env_vars! {
    struct FrontendPort;
    /// Canonical browser URL to return to after authentication.
    struct AppBaseUrl;
    /// Optional parent domain for cross-subdomain auth cookies. Unset means
    /// host-only cookies, which is the safe standalone/same-origin default.
    struct AuthCookieDomain;
}

/// Generates a random 25 character session code
pub fn generate_session_code() -> String {
    const CHARSET_LOWER: &[u8] = b"abcdefghijklmnopqrstuvwxyz";
    const CHARSET_UPPER: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const CHARSET_NUMBERS: &[u8] = b"0123456789";

    let mut rng = rand::rng();
    let mut code = String::with_capacity(25);

    // Ensure at least one character from each set
    code.push(CHARSET_LOWER[rng.random_range(0..CHARSET_LOWER.len())] as char);
    code.push(CHARSET_UPPER[rng.random_range(0..CHARSET_UPPER.len())] as char);
    code.push(CHARSET_NUMBERS[rng.random_range(0..CHARSET_NUMBERS.len())] as char);

    // Combine all charsets for remaining characters
    let combined_charset: Vec<u8> = CHARSET_LOWER
        .iter()
        .chain(CHARSET_UPPER)
        .chain(CHARSET_NUMBERS)
        .copied()
        .collect();

    // Fill the remaining 22 characters
    for _ in 0..22 {
        let idx = rng.random_range(0..combined_charset.len());
        code.push(combined_charset[idx] as char);
    }

    // Shuffle the entire code to avoid predictable character positions
    let mut code_chars: Vec<char> = code.chars().collect();
    code_chars.shuffle(&mut rng);

    code_chars.into_iter().collect()
}

/// Returns the default redirect url based on the environment
pub fn default_redirect_url() -> Url {
    configured_app_base_url().expect("APP_BASE_URL must be a valid browser-facing URL")
}

pub(crate) fn configured_app_base_url() -> anyhow::Result<Url> {
    let app_base_url = AppBaseUrl::new();
    let frontend_port = FrontendPort::new();
    resolve_app_base_url(
        Environment::new_or_prod(),
        app_base_url.as_ref().map(AsRef::as_ref),
        frontend_port.as_ref().map(AsRef::as_ref),
    )
}

fn resolve_app_base_url(
    environment: Environment,
    configured: Option<&str>,
    frontend_port: Option<&str>,
) -> anyhow::Result<Url> {
    let default;
    let value = match configured {
        Some(value) if !value.trim().is_empty() => value.trim(),
        Some(_) => anyhow::bail!("APP_BASE_URL must not be blank"),
        None => {
            default = match environment {
                Environment::Local => {
                    let port = frontend_port.unwrap_or("3000");
                    port.parse::<u16>()
                        .context("FRONTEND_PORT must be a valid TCP port")?;
                    format!("http://localhost:{port}")
                }
                Environment::Develop => "https://dev.conation.dev/app".to_owned(),
                Environment::Production => "https://conation.dev/app".to_owned(),
            };
            &default
        }
    };

    let url = Url::parse(value).context("APP_BASE_URL must be an absolute URL")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        anyhow::bail!(
            "APP_BASE_URL must contain an http(s) scheme, host, optional port, and optional path only"
        );
    }

    Ok(url)
}

pub(crate) fn configured_app_origin() -> anyhow::Result<String> {
    let app_base_url = configured_app_base_url()?;
    macro_cors::normalize_origin(&app_base_url.origin().ascii_serialization())
        .map_err(anyhow::Error::msg)
        .context("APP_BASE_URL does not have a valid browser origin")
}

fn resolve_cookie_domain(configured: Option<&str>) -> anyhow::Result<Option<String>> {
    let Some(configured) = configured else {
        return Ok(None);
    };
    let configured = configured.trim().trim_start_matches('.');
    if configured.is_empty() {
        anyhow::bail!("AUTH_COOKIE_DOMAIN must not be blank");
    }

    let parsed = Url::parse(&format!("https://{configured}"))
        .context("AUTH_COOKIE_DOMAIN must be a bare DNS hostname")?;
    let host = parsed
        .host_str()
        .context("AUTH_COOKIE_DOMAIN must contain a DNS hostname")?;
    if parsed.port().is_some()
        || parsed.path() != "/"
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || host != configured.to_ascii_lowercase()
    {
        anyhow::bail!("AUTH_COOKIE_DOMAIN must be a bare DNS hostname");
    }

    Ok(Some(host.to_owned()))
}

fn domain() -> Option<String> {
    let configured = AuthCookieDomain::new();
    resolve_cookie_domain(configured.as_ref().map(AsRef::as_ref))
        .expect("AUTH_COOKIE_DOMAIN must be a bare DNS hostname")
}

pub(crate) fn validate_runtime_web_config() -> anyhow::Result<()> {
    configured_app_base_url()?;
    configured_app_origin()?;
    let cookie_domain = AuthCookieDomain::new();
    resolve_cookie_domain(cookie_domain.as_ref().map(AsRef::as_ref))?;
    macro_cors::configured_allowed_origins()
        .map_err(anyhow::Error::msg)
        .context("invalid ALLOWED_ORIGINS")?;
    Ok(())
}

fn same_site() -> SameSite {
    match Environment::new_or_prod() {
        Environment::Production => SameSite::Strict,
        Environment::Local | Environment::Develop => SameSite::None,
    }
}

pub fn create_access_token_cookie(token: &str) -> Cookie<'static> {
    let same_site = same_site();
    let domain = domain();
    let access_token_cookie_name = match Environment::new_or_prod() {
        Environment::Production => CONATION_ACCESS_TOKEN_COOKIE.to_string(),
        Environment::Develop => format!("dev-{CONATION_ACCESS_TOKEN_COOKIE}"),
        Environment::Local => format!("local-{CONATION_ACCESS_TOKEN_COOKIE}"),
    };

    let mut cookie = Cookie::new(
        access_token_cookie_name,
        token.to_owned(), // Convert the borrowed str to an owned String
    );
    cookie.set_secure(true);
    cookie.set_http_only(true);
    cookie.set_same_site(same_site);
    if let Some(domain) = domain {
        cookie.set_domain(domain);
    }
    cookie.set_path("/");
    cookie.set_expires(Some(
        time::OffsetDateTime::now_utc() + time::Duration::days(365),
    ));
    cookie
}

pub fn create_refresh_token_cookie(token: &str) -> Cookie<'static> {
    let same_site = same_site();
    let domain = domain();
    let refresh_token_cookie_name = match Environment::new_or_prod() {
        Environment::Production => CONATION_REFRESH_TOKEN_COOKIE.to_string(),
        Environment::Develop => format!("dev-{CONATION_REFRESH_TOKEN_COOKIE}"),
        Environment::Local => format!("local-{CONATION_REFRESH_TOKEN_COOKIE}"),
    };
    let mut cookie = Cookie::new(
        refresh_token_cookie_name,
        token.to_owned(), // Convert the borrowed str to an owned String
    );
    cookie.set_secure(true);
    cookie.set_http_only(true);
    cookie.set_same_site(same_site);
    if let Some(domain) = domain {
        cookie.set_domain(domain);
    }
    cookie.set_path("/");
    cookie.set_expires(Some(
        time::OffsetDateTime::now_utc() + time::Duration::days(365),
    ));
    cookie
}

/// If this account was created during the auth flow that is completing (the
/// create-user webhook marks it in the cache), appends `signed_up=true` to the
/// redirect URL so the app can attribute the session as a signup for
/// analytics. Best-effort: never fails the login.
pub async fn append_signed_up_param_if_new_user(
    conation_cache_client: &macro_cache_client::MacroCache,
    email: &str,
    redirect_url: &mut Url,
) {
    match conation_cache_client.take_user_just_signed_up(email).await {
        Ok(true) => {
            redirect_url
                .query_pairs_mut()
                .append_pair("signed_up", "true");
        }
        Ok(false) => {}
        Err(e) => {
            tracing::error!(error=?e, "unable to check just-signed-up marker");
        }
    }
}

/// Provisions the user's primary inbox as a side effect of authentication,
/// the moment a fresh access token exists. Fire-and-forget so the login
/// response is never delayed. The email service arbitrates: a login without a
/// usable Gmail grant is an expected no-op, and init is idempotent and recurs
/// on every login, so a lost attempt only delays provisioning until the next one.
pub fn spawn_first_inbox_provision(ctx: &ApiContext, access_token: &str) {
    let email_service_client = ctx.email_service_client.clone();
    let access_token = access_token.to_string();

    tokio::spawn(async move {
        match email_service_client
            .provision_first_inbox(&access_token)
            .await
        {
            Ok(FirstInboxProvisionOutcome::Provisioned) => {
                tracing::info!("first-inbox provision: inbox initialized on login");
            }
            Ok(FirstInboxProvisionOutcome::Skipped) => {}
            Err(e) => {
                tracing::warn!(error=?e, "first-inbox provision: init failed");
            }
        }
    });
}
