//! The ACP bridge and its loopback-only OmniRoute fallback proxy.

use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::body::{Body, to_bytes};
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Request, State};
use axum::http::header::{ACCEPT, AUTHORIZATION, CONTENT_ENCODING, CONTENT_LENGTH, CONTENT_TYPE};
use axum::http::{HeaderName, HeaderValue, Method, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use futures_util::{SinkExt, StreamExt};
use reqwest::{Client, Url};
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::Semaphore;

#[cfg(test)]
mod test;

/// Ordered only by this sidecar: OpenCode itself has no native model fallback.
const FALLBACK_MODELS: [&str; 3] = ["gemini-2.5-flash", "nemotron-3-ultra", "gpt-5.6-luna"];
const FIXED_FALLBACK_MODELS_TEXT: &str = "gemini-2.5-flash,nemotron-3-ultra,gpt-5.6-luna";
const DEFAULT_ROX_RESPONSE_HEADER_TIMEOUT_MS: u64 = 30_000;
const MAX_PROXY_REQUEST_BYTES: usize = 1024 * 1024;
const MODEL_PROXY_URL_VARIABLE: &str = "CONATION_MODEL_PROXY_URL";
const MODEL_SESSION_TOKEN_VARIABLE: &str = "CONATION_MODEL_SESSION_TOKEN";

/// Shared handler state.
#[derive(Clone)]
pub struct Config {
    harness: String,
    workspace: String,
    /// Only one agent connection at a time (ACP is 1:1).
    busy: Arc<Semaphore>,
    proxy: ProxyConfig,
}

impl Config {
    /// Construct the ACP-only default used by bridge tests.
    pub fn new(harness: String, workspace: String) -> Self {
        Self::with_proxy(harness, workspace, ProxyConfig::default())
    }

    /// Construct the production sidecar configuration from its sandbox-only
    /// environment variables.
    pub fn from_env(harness: String, workspace: String) -> Result<Self, String> {
        Ok(Self::with_proxy(
            harness,
            workspace,
            ProxyConfig::from_env()?,
        ))
    }

    fn with_proxy(harness: String, workspace: String, proxy: ProxyConfig) -> Self {
        Self {
            harness,
            workspace,
            busy: Arc::new(Semaphore::new(1)),
            proxy,
        }
    }
}

/// The session-authorized model gateway and ordered fallback state. The
/// deployment's OmniRoute credential never enters this process; only the
/// sandbox's bounded egress capability is retained as a header value.
#[derive(Clone)]
struct ProxyConfig {
    session_token: Option<HeaderValue>,
    response_header_timeout: Duration,
    upstream_base_url: Url,
    client: Client,
}

impl Default for ProxyConfig {
    fn default() -> Self {
        Self::from_values(
            "https://egress.invalid/openai/v1",
            "",
            None,
            DEFAULT_ROX_RESPONSE_HEADER_TIMEOUT_MS.to_string(),
        )
        .expect("default OmniRoute fallback proxy configuration is valid")
    }
}

impl ProxyConfig {
    fn from_env() -> Result<Self, String> {
        let upstream_base_url = std::env::var(MODEL_PROXY_URL_VARIABLE)
            .unwrap_or_else(|_| "https://egress.invalid/openai/v1".to_owned());
        let response_header_timeout = std::env::var("ROX_PROXY_TIMEOUT_MS")
            .unwrap_or_else(|_| DEFAULT_ROX_RESPONSE_HEADER_TIMEOUT_MS.to_string());
        let session_token = match std::env::var(MODEL_SESSION_TOKEN_VARIABLE) {
            Ok(value) if value.trim().is_empty() => None,
            Ok(value) => Some(value),
            Err(std::env::VarError::NotPresent) => None,
            Err(std::env::VarError::NotUnicode(_)) => {
                return Err("CONATION_MODEL_SESSION_TOKEN must be valid UTF-8".to_owned());
            }
        };

        Self::from_values(
            &upstream_base_url,
            "",
            session_token,
            response_header_timeout,
        )
    }

    fn from_values(
        upstream_base_url: &str,
        requested_fallback_models: &str,
        session_token: Option<String>,
        response_header_timeout: String,
    ) -> Result<Self, String> {
        let upstream_base_url = parse_upstream_base_url(upstream_base_url)?;
        if !requested_fallback_models.is_empty()
            && requested_fallback_models != FIXED_FALLBACK_MODELS_TEXT
        {
            return Err("fallback order is fixed by the Conation sidecar".to_owned());
        }
        let response_header_timeout = parse_response_header_timeout(&response_header_timeout)?;
        let session_token = session_token.map(parse_bearer_header).transpose()?;
        let client = Client::builder()
            // This process owns retry order. Reqwest's transparent protocol
            // retry would make a POST attempt invisible to that ordering.
            .retry(reqwest::retry::never())
            // An upstream redirect could carry the service credential to a
            // different authority, so fallbacks never follow redirects.
            .redirect(reqwest::redirect::Policy::none())
            .no_proxy()
            .build()
            .map_err(|_| "could not initialize OmniRoute HTTP client".to_owned())?;

        Ok(Self {
            session_token,
            response_header_timeout,
            upstream_base_url,
            client,
        })
    }

    fn upstream_url(&self, uri: &Uri) -> Result<Url, ()> {
        let Some(relative_path) = uri.path().strip_prefix("/v1") else {
            return Err(());
        };
        let relative_path = relative_path.trim_start_matches('/');
        if relative_path.split('/').any(|segment| {
            matches!(segment, "." | "..") || segment.to_ascii_lowercase().contains("%2e")
        }) || relative_path
            .split('/')
            .next()
            .is_some_and(|segment| segment.contains(':'))
        {
            return Err(());
        }

        let mut url = self.upstream_base_url.join(relative_path).map_err(|_| ())?;
        if url.origin() != self.upstream_base_url.origin()
            || !url.path().starts_with(self.upstream_base_url.path())
        {
            return Err(());
        }
        url.set_query(uri.query());
        Ok(url)
    }

    fn request_bodies(&self, body: &[u8]) -> Result<Vec<Vec<u8>>, &'static str> {
        let mut payload = serde_json::from_slice::<Value>(body)
            .map_err(|_| "chat-completions request must be JSON")?;
        let Some(model) = payload
            .as_object()
            .and_then(|object| object.get("model"))
            .and_then(Value::as_str)
        else {
            return Err("chat-completions request must name a model");
        };
        let (provider_prefix, model) = model
            .strip_prefix("rox/")
            .map_or(("", model), |model| ("rox/", model));
        let Some(start_index) = FALLBACK_MODELS
            .iter()
            .position(|candidate| *candidate == model)
        else {
            return Err("model is not allowed for this sandbox");
        };

        Ok(FALLBACK_MODELS[start_index..]
            .iter()
            .map(|model| {
                payload["model"] = Value::String(format!("{provider_prefix}{model}"));
                serde_json::to_vec(&payload).expect("JSON values serialize")
            })
            .collect())
    }

    fn request(
        &self,
        method: &Method,
        headers: &axum::http::HeaderMap,
        url: Url,
        body: Vec<u8>,
    ) -> reqwest::RequestBuilder {
        let mut request = self.client.request(method.clone(), url).body(body);
        // A deliberately tiny allow-list retains the content and streaming
        // negotiation OpenCode needs while preventing client credentials from
        // crossing this local trust boundary.
        for header in [ACCEPT, CONTENT_TYPE] {
            if let Some(value) = headers.get(&header) {
                request = request.header(header, value);
            }
        }
        request.header(
            AUTHORIZATION,
            self.session_token
                .as_ref()
                .expect("proxy requests require a configured egress capability")
                .clone(),
        )
    }
}

fn parse_upstream_base_url(value: &str) -> Result<Url, String> {
    let mut url = Url::parse(value)
        .map_err(|_| "CONATION_MODEL_PROXY_URL must be an absolute HTTP(S) URL".to_owned())?;
    let Some(host) = url.host_str() else {
        return Err("CONATION_MODEL_PROXY_URL must include a host".to_owned());
    };
    let loopback_host = host.eq_ignore_ascii_case("localhost")
        || host
            .parse::<std::net::IpAddr>()
            .is_ok_and(|address| address.is_loopback());
    if !matches!(url.scheme(), "https" | "http") || (url.scheme() == "http" && !loopback_host) {
        return Err("CONATION_MODEL_PROXY_URL must use HTTPS (or loopback HTTP)".to_owned());
    }
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(
            "CONATION_MODEL_PROXY_URL must not include credentials, query, or fragment".to_owned(),
        );
    }
    if url.path().trim_end_matches('/') != "/openai/v1" {
        return Err("CONATION_MODEL_PROXY_URL must end in /openai/v1".to_owned());
    }

    url.set_path("/openai/v1/");
    Ok(url)
}


fn parse_response_header_timeout(value: &str) -> Result<Duration, String> {
    let milliseconds = value
        .parse::<u64>()
        .map_err(|_| "ROX_PROXY_TIMEOUT_MS must be an integer".to_owned())?;
    if !(1_000..=120_000).contains(&milliseconds) {
        return Err("ROX_PROXY_TIMEOUT_MS must be between 1000 and 120000".to_owned());
    }
    Ok(Duration::from_millis(milliseconds))
}

fn parse_bearer_header(session_token: String) -> Result<HeaderValue, String> {
    if session_token.len() > 8_192 || session_token.chars().any(char::is_control) {
        return Err("CONATION_MODEL_SESSION_TOKEN contains unsafe characters".to_owned());
    }
    HeaderValue::from_str(&format!("Bearer {session_token}"))
        .map_err(|_| "CONATION_MODEL_SESSION_TOKEN contains unsafe characters".to_owned())
}

pub fn app(config: Config) -> Router {
    acp_app(config)
}

/// ACP stays network-accessible for the session controller.
pub fn acp_app(config: Config) -> Router {
    Router::new()
        .route("/ping", get(async || "ok"))
        .route("/", get(bridge))
        .with_state(config)
}

/// OpenCode reaches this router only through the loopback listener in `main`.
pub fn proxy_app(config: Config) -> Router {
    Router::new()
        .route("/v1/chat/completions", post(proxy))
        .with_state(config)
}

async fn proxy(State(config): State<Config>, request: Request) -> Response {
    if config.proxy.session_token.is_none() {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "OmniRoute is not configured for this sandbox",
        )
            .into_response();
    }

    let (parts, body) = request.into_parts();
    let body = match to_bytes(body, MAX_PROXY_REQUEST_BYTES).await {
        Ok(body) => body,
        Err(_) => {
            return (StatusCode::PAYLOAD_TOO_LARGE, "request body is too large").into_response();
        }
    };
    let upstream_url = match config.proxy.upstream_url(&parts.uri) {
        Ok(url) => url,
        Err(()) => {
            return (StatusCode::BAD_REQUEST, "invalid OpenAI-compatible path").into_response();
        }
    };
    let attempts = match config.proxy.request_bodies(&body) {
        Ok(attempts) => attempts,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };
    let final_attempt = attempts.len().saturating_sub(1);

    for (attempt_index, attempt_body) in attempts.into_iter().enumerate() {
        let request = config.proxy.request(
            &parts.method,
            &parts.headers,
            upstream_url.clone(),
            attempt_body,
        );
        match tokio::time::timeout(config.proxy.response_header_timeout, request.send()).await {
            Ok(Ok(response))
                if is_retryable_status(response.status()) && attempt_index < final_attempt =>
            {
                // Drop a pre-body 408/429/5xx and advance in strict order.
            }
            Ok(Ok(response)) => return forward_response(response),
            Ok(Err(error))
                if is_safe_pre_response_failure(&error) && attempt_index < final_attempt =>
            {
                // The request never produced response headers; this is the only
                // transport failure class that may advance to a fallback.
            }
            Ok(Err(_)) | Err(_) => {
                return (
                    StatusCode::BAD_GATEWAY,
                    "OmniRoute request failed before a response",
                )
                    .into_response();
            }
        }
    }

    (
        StatusCode::BAD_GATEWAY,
        "OmniRoute request failed before a response",
    )
        .into_response()
}

fn is_retryable_status(status: StatusCode) -> bool {
    status == StatusCode::REQUEST_TIMEOUT
        || status == StatusCode::TOO_MANY_REQUESTS
        || status.is_server_error()
}

fn is_safe_pre_response_failure(error: &reqwest::Error) -> bool {
    error.is_timeout()
        || error.is_connect()
        || (error.is_request()
            && error.status().is_none()
            && !error.is_builder()
            && !error.is_redirect())
}

fn forward_response(response: reqwest::Response) -> Response {
    let status = response.status();
    let headers = response.headers().clone();
    let mut proxied = Response::new(Body::from_stream(response.bytes_stream()));
    *proxied.status_mut() = status;
    for (name, value) in &headers {
        if !is_hop_by_hop_response_header(name)
            && name != CONTENT_ENCODING
            && name != CONTENT_LENGTH
        {
            proxied.headers_mut().append(name, value.clone());
        }
    }
    proxied
}

fn is_hop_by_hop_response_header(name: &HeaderName) -> bool {
    matches!(
        name.as_str(),
        "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
    )
}

async fn bridge(State(config): State<Config>, ws: WebSocketUpgrade) -> Response {
    let Ok(permit) = config.busy.clone().try_acquire_owned() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "an agent connection is already active",
        )
            .into_response();
    };
    // ACP frames carry file contents; don't limit their size.
    ws.max_message_size(usize::MAX)
        .max_frame_size(usize::MAX)
        .on_upgrade(move |socket| async move {
            pipe(socket, &config.harness, &config.workspace).await;
            drop(permit);
        })
        .into_response()
}

async fn pipe(socket: WebSocket, harness: &str, workspace: &str) {
    let mut child = match Command::new(harness)
        .args(["acp", "--cwd", workspace])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit()) // → sandbox logs
        .kill_on_drop(true)
        .spawn()
    {
        Ok(child) => child,
        Err(e) => {
            tracing::error!(error = ?e, harness, "failed to spawn harness");
            return;
        }
    };
    let mut stdin = child.stdin.take().expect("stdin was piped");
    let stdout = child.stdout.take().expect("stdout was piped");
    tracing::info!("agent connected, harness spawned");

    let (mut ws_tx, mut ws_rx) = socket.split();
    let mut lines = BufReader::new(stdout).lines();
    loop {
        tokio::select! {
            line = lines.next_line() => match line {
                Ok(Some(line)) => {
                    if ws_tx.send(Message::Text(line.into())).await.is_err() {
                        break;
                    }
                }
                Ok(None) => {
                    tracing::info!("harness exited, closing socket");
                    let _ = ws_tx.send(Message::Close(None)).await;
                    break;
                }
                Err(e) => {
                    tracing::error!(error = ?e, "failed to read harness stdout, closing socket");
                    let _ = ws_tx.send(Message::Close(None)).await;
                    break;
                }
            },
            msg = ws_rx.next() => {
                let bytes = match msg {
                    Some(Ok(Message::Binary(data))) => data,
                    Some(Ok(Message::Text(text))) => text.into(),
                    // axum answers pings itself; ignore strays.
                    Some(Ok(Message::Ping(_) | Message::Pong(_))) => continue,
                    Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                };
                if stdin.write_all(&bytes).await.is_err()
                    || stdin.write_all(b"\n").await.is_err()
                {
                    break;
                }
            },
        }
    }

    let _ = child.kill().await;
    tracing::info!("agent disconnected, harness killed");
}
