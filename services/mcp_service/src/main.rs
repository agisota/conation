//! MCP server binary that serves the DCS AI toolset over HTTP.
//!
//! This binary spins up a Streamable HTTP MCP server exposing the same
//! tools that are available in the DCS chat/stream API, with OAuth 2.1
//! authentication backed by FusionAuth.

mod config;
mod context;
mod markdown_images;
#[cfg(test)]
mod test;
mod tool_service;
use anyhow::{Context, bail};
use axum::{
    extract::State,
    http::{Request, StatusCode, header},
    middleware::{Next, from_fn_with_state},
    response::{IntoResponse, Response},
};
use conation_entrypoint::MacroEntrypoint;
use config::Config;
use context::build_context;
use mcp_auth_proxy::domain::service::McpAuthProxyService;
use mcp_auth_proxy::inbound::axum_router::mcp_router;
use rmcp::transport::streamable_http_server::{
    StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
};
use std::sync::Arc;
use tokio::time::Duration;
use tokio_util::task::TaskTracker;
use tool_service::AuthenticatedToolService;

const AUTH_PROXY_CLEANUP_INTERVAL: Duration = Duration::from_secs(60);
const EVENT_BROKER_DRAIN_TIMEOUT: Duration = Duration::from_secs(10);
const LOCAL_MCP_INTERNAL_AUTHORITY: &str = "mcp-service:8080";

#[derive(Debug, PartialEq, Eq)]
enum HostValidationError {
    Malformed,
    Forbidden,
}

fn canonical_authority(raw: &str) -> Option<(String, Option<u16>)> {
    if raw.contains('@') {
        return None;
    }
    let authority = http::uri::Authority::try_from(raw).ok()?;
    Some((
        authority
            .host()
            .trim_matches(['[', ']'])
            .to_ascii_lowercase(),
        authority.port_u16(),
    ))
}

fn validate_mcp_authority(raw: &str, allowed_hosts: &[String]) -> Result<(), HostValidationError> {
    let authority = canonical_authority(raw).ok_or(HostValidationError::Malformed)?;
    allowed_hosts
        .iter()
        .filter_map(|allowed| canonical_authority(allowed))
        .any(|allowed| allowed == authority)
        .then_some(())
        .ok_or(HostValidationError::Forbidden)
}

fn mcp_allowed_hosts(
    public_url: &str,
    environment: config::Environment,
) -> anyhow::Result<Vec<String>> {
    let uri = http::Uri::try_from(public_url).context("MCP_PUBLIC_URL is not a valid URI")?;
    if !matches!(uri.scheme_str(), Some("http" | "https")) {
        bail!("MCP_PUBLIC_URL must use http or https");
    }
    let public_authority = uri
        .authority()
        .context("MCP_PUBLIC_URL must have an authority")?
        .as_str();
    if canonical_authority(public_authority).is_none() {
        bail!("MCP_PUBLIC_URL must not contain userinfo or a malformed authority");
    }
    if uri
        .path_and_query()
        .is_some_and(|path_and_query| path_and_query.as_str() != "/")
    {
        bail!("MCP_PUBLIC_URL must be a root origin without a query");
    }

    let mut hosts = vec![public_authority.to_owned()];
    if matches!(environment, config::Environment::Local) {
        // The agent egress proxy is the only direct in-network client. Include
        // its exact authority (including port), never a suffix or wildcard.
        hosts.push(LOCAL_MCP_INTERNAL_AUTHORITY.to_owned());
    }
    Ok(hosts)
}

async fn enforce_mcp_host(
    State(allowed_hosts): State<Vec<String>>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Response {
    // Target-group and local container health probes do not carry the public
    // authority. The endpoint returns only a constant and has no auth state.
    if request.uri().path() == "/health" {
        return next.run(request).await;
    }
    let raw_authority = request
        .headers()
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
        .or_else(|| {
            request
                .uri()
                .authority()
                .map(|authority| authority.as_str())
        });
    match raw_authority.map(|raw| validate_mcp_authority(raw, &allowed_hosts)) {
        Some(Ok(())) => next.run(request).await,
        Some(Err(HostValidationError::Forbidden)) => {
            (StatusCode::FORBIDDEN, "Host header is not allowed").into_response()
        }
        Some(Err(HostValidationError::Malformed)) | None => {
            (StatusCode::BAD_REQUEST, "invalid Host header").into_response()
        }
    }
}

#[tokio::main]
#[tracing::instrument(err)]
async fn main() -> anyhow::Result<()> {
    MacroEntrypoint::default().init();

    let config = Config::from_env()?;

    // Base URL of the Conation web app, used to build links to Conation items
    // in MCP responses.
    let item_base_url = config.app_base_url.as_ref().to_string();

    let event_broker_tracker = TaskTracker::new();
    let context = build_context(&config, event_broker_tracker.clone()).await?;
    let allowed_hosts = mcp_allowed_hosts(config.mcp_public_url.as_ref(), config.environment)?;
    tracing::debug!(
        public_host = %context.mcp_public_host,
        allowed_hosts = ?allowed_hosts,
        "configured MCP Host authority policy"
    );

    // Create the MCP service with authenticated tool handler
    let mcp_service = StreamableHttpService::new(
        move || {
            let tools = ai_tools::mcp_tools();
            Ok(AuthenticatedToolService::new(
                tools.toolset,
                context.tool_context.clone(),
                item_base_url.clone(),
            ))
        },
        Arc::new(LocalSessionManager::default()),
        {
            let mut config =
                StreamableHttpServerConfig::default().with_allowed_hosts(allowed_hosts.clone());
            config.stateful_mode = false;
            config.json_response = true;
            config
        },
    );

    // Spawn background cleanup for expired OAuth entries
    let cleanup_state = context.auth_proxy.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(AUTH_PROXY_CLEANUP_INTERVAL);
        loop {
            interval.tick().await;
            if let Err(error) = cleanup_state.cleanup_expired().await {
                tracing::error!(error=?error, "auth proxy cleanup task failed");
            }
        }
    });

    let app = mcp_router(context.auth_proxy, context.jwt_args, mcp_service)
        .layer(from_fn_with_state(allowed_hosts, enforce_mcp_host));

    let port = config.port;
    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .context("failed to bind MCP server")?;

    tracing::info!("MCP server listening on http://{addr}/mcp");

    let server_result = axum::serve(listener, app)
        .with_graceful_shutdown(conation_entrypoint::shutdown_signal())
        .await
        .context("MCP server error");

    tracing::info!("waiting for event broker publishes to drain");
    event_broker_tracker.close();
    match tokio::time::timeout(EVENT_BROKER_DRAIN_TIMEOUT, event_broker_tracker.wait()).await {
        Ok(()) => tracing::info!("event broker publishes drained"),
        Err(error) => {
            tracing::warn!(
                error=?error,
                timeout_seconds = EVENT_BROKER_DRAIN_TIMEOUT.as_secs(),
                "timed out waiting for event broker publishes to drain"
            );
        }
    }

    server_result
}
