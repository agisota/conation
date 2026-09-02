#[cfg(test)]
mod test;

use axum::http::{
    HeaderName, HeaderValue, Method,
    header::{AUTHORIZATION, CONTENT_TYPE},
};
use conation_env_var::maybe_env_vars;
use tower_http::cors::{AllowOrigin, CorsLayer};
use url::Url;

static DEFAULT_ALLOWED_ORIGINS: [&str; 12] = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://host.local:3000",
    "https://dev.conation.dev",
    "https://staging.conation.dev",
    "https://www.conation.dev",
    "https://app.conation.dev",
    "https://conation.dev",
    "http://tauri.localhost",
    "tauri://localhost",
    "capacitor://localhost",
    "http://conation.localhost",
];

static EXTRA_HEADERS: [&str; 4] = [
    "x-permissions-token",
    "traceparent",
    "tracestate",
    "x-email-link-id",
];

maybe_env_vars! {
    /// Comma-separated exact browser origins allowed to call Conation services.
    struct AllowedOrigins;
}

/// Normalizes and validates one browser origin.
///
/// Paths, credentials, query strings, fragments, and non-browser schemes are
/// rejected. The returned value never has a trailing slash, matching the
/// browser `Origin` header format.
pub fn normalize_origin(origin: &str) -> Result<String, String> {
    let origin = origin.trim();
    if origin.is_empty() {
        return Err("origin must not be empty".to_owned());
    }

    let parsed =
        Url::parse(origin).map_err(|error| format!("invalid origin {origin:?}: {error}"))?;
    if !matches!(parsed.scheme(), "http" | "https" | "tauri" | "capacitor") {
        return Err(format!("unsupported origin scheme in {origin:?}"));
    }
    if parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || !matches!(parsed.path(), "" | "/")
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err(format!(
            "origin must contain only a scheme, host, and optional port: {origin:?}"
        ));
    }

    Ok(parsed.as_str().trim_end_matches('/').to_owned())
}

/// Parses a comma-separated exact origin allowlist.
pub fn parse_allowed_origins(origins: &str) -> Result<Vec<String>, String> {
    let mut parsed = Vec::new();
    for origin in origins.split(',') {
        let origin = normalize_origin(origin)?;
        if !parsed.contains(&origin) {
            parsed.push(origin);
        }
    }

    if parsed.is_empty() {
        return Err("origin allowlist must contain at least one origin".to_owned());
    }

    Ok(parsed)
}

/// Resolves the runtime allowlist. `ALLOWED_ORIGINS` replaces the Conation
/// defaults when set, making hosted-legacy origins an explicit deployment
/// choice rather than an implicit fallback.
pub fn configured_allowed_origins() -> Result<Vec<String>, String> {
    match AllowedOrigins::new() {
        Some(origins) => parse_allowed_origins(origins.as_ref()),
        None => DEFAULT_ALLOWED_ORIGINS
            .iter()
            .map(|origin| normalize_origin(origin))
            .collect(),
    }
}

/// Generates the Cors layer which can be used in the `ServiceBuilder::layer` method.
pub fn cors_layer() -> CorsLayer {
    cors_layer_with_headers(vec![])
}

/// Checks an origin against an already-resolved exact allowlist plus the
/// bounded loopback development range.
pub fn is_origin_allowed_with(origin: &str, allowed_origins: &[String]) -> bool {
    let Ok(origin) = normalize_origin(origin) else {
        return false;
    };

    if allowed_origins.contains(&origin) {
        return true;
    }

    // `localhost` and `*.localhost` (loopback-reserved per RFC 6761; used
    // locally to give each seeded persona its own cookie jar per hostname).
    if let Ok(parsed) = Url::parse(&origin)
        && parsed.scheme() == "http"
        && matches!(
            parsed.host_str(),
            Some(host) if host == "localhost" || host.ends_with(".localhost")
        )
        && let Some(port) = parsed.port()
    {
        return (3000..=3999).contains(&port) || (20000..=60000).contains(&port);
    }

    false
}

/// Checks an origin against the runtime `ALLOWED_ORIGINS` configuration.
/// Invalid configuration fails closed.
pub fn is_origin_allowed(origin: &str) -> bool {
    configured_allowed_origins()
        .map(|origins| is_origin_allowed_with(origin, &origins))
        .unwrap_or(false)
}

/// Generates the Cors layer with additional headers which can be used in the `ServiceBuilder::layer` method.
pub fn cors_layer_with_headers(additional_headers: Vec<HeaderName>) -> CorsLayer {
    let allowed_origins = configured_allowed_origins()
        .expect("ALLOWED_ORIGINS must be a comma-separated list of exact browser origins");
    let mut headers = vec![AUTHORIZATION, CONTENT_TYPE];
    headers.extend(additional_headers);
    headers.extend(
        EXTRA_HEADERS
            .iter()
            .map(|header| HeaderName::from_static(header)),
    );

    CorsLayer::new()
        .allow_credentials(true)
        .allow_headers(headers)
        .allow_methods(vec![
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_origin(AllowOrigin::predicate(
            move |origin: &HeaderValue, _request_parts| {
                origin
                    .to_str()
                    .map(|origin| is_origin_allowed_with(origin, &allowed_origins))
                    .unwrap_or(false)
            },
        ))
}
