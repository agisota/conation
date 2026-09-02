use std::collections::VecDeque;
use std::net::SocketAddr;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::Router;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::HeaderValue;
use axum::routing::any;
use futures_util::{SinkExt, StreamExt};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_tungstenite::tungstenite;

use super::*;

static UNIQUE: AtomicUsize = AtomicUsize::new(0);

/// Write an executable shell script that stands in for the ACP harness. The
/// sidecar invokes it as `<script> acp --cwd <workspace>`; the bodies ignore
/// those args.
fn fake_harness(body: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!(
        "acp-sidecar-test-{}-{}",
        std::process::id(),
        UNIQUE.fetch_add(1, Ordering::Relaxed),
    ));
    std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).expect("write fake harness");
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))
        .expect("chmod fake harness");
    path
}

/// Serve the sidecar app on an ephemeral port with the given harness.
async fn serve(harness: &Path) -> SocketAddr {
    let config = Config::new(
        harness.to_str().expect("utf-8 path").to_owned(),
        std::env::temp_dir()
            .to_str()
            .expect("utf-8 path")
            .to_owned(),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind");
    let addr = listener.local_addr().expect("local addr");
    tokio::spawn(axum::serve(listener, app(config)).into_future());
    addr
}

async fn connect(
    addr: SocketAddr,
) -> Result<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    tungstenite::Error,
> {
    tokio_tungstenite::connect_async(format!("ws://{addr}/"))
        .await
        .map(|(ws, _)| ws)
}

#[tokio::test]
async fn ping_answers_ok() {
    let harness = fake_harness("exec cat");
    let addr = serve(&harness).await;

    let mut stream = tokio::net::TcpStream::connect(addr).await.expect("connect");
    stream
        .write_all(
            format!("GET /ping HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n").as_bytes(),
        )
        .await
        .expect("send request");
    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .await
        .expect("read response");
    assert!(response.starts_with("HTTP/1.1 200"), "{response}");
    assert!(response.ends_with("ok"), "{response}");
}

#[tokio::test]
async fn round_trips_one_message_per_frame() {
    let harness = fake_harness("exec cat");
    let addr = serve(&harness).await;
    let mut ws = connect(addr).await.expect("ws connect");

    // One frame in = one NDJSON line on stdin; `cat` echoes the line back,
    // which must come out as one text frame without the newline.
    ws.send(tungstenite::Message::Text("{\"id\":1}".into()))
        .await
        .expect("send text");
    let echoed = ws.next().await.expect("stream open").expect("read frame");
    assert_eq!(echoed, tungstenite::Message::Text("{\"id\":1}".into()));

    // Binary frames carry the same contract.
    ws.send(tungstenite::Message::Binary(b"{\"id\":2}".to_vec().into()))
        .await
        .expect("send binary");
    let echoed = ws.next().await.expect("stream open").expect("read frame");
    assert_eq!(echoed, tungstenite::Message::Text("{\"id\":2}".into()));
}

#[tokio::test]
async fn second_connection_gets_503() {
    let harness = fake_harness("exec cat");
    let addr = serve(&harness).await;
    let _first = connect(addr).await.expect("first ws connect");

    match connect(addr).await {
        Err(tungstenite::Error::Http(response)) => {
            assert_eq!(response.status(), 503, "{response:?}");
        }
        other => panic!("expected HTTP 503 rejection, got {other:?}"),
    }
}

#[tokio::test]
async fn slot_frees_after_disconnect() {
    let harness = fake_harness("exec cat");
    let addr = serve(&harness).await;

    let mut first = connect(addr).await.expect("first ws connect");
    first.close(None).await.expect("close first");

    // The permit is released once the server notices the disconnect; retry
    // until the slot frees.
    for _ in 0..100 {
        if connect(addr).await.is_ok() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    panic!("connection slot never freed after disconnect");
}

#[tokio::test]
async fn harness_exit_closes_socket() {
    let harness = fake_harness("printf bye");
    let addr = serve(&harness).await;
    let mut ws = connect(addr).await.expect("ws connect");

    let bye = ws.next().await.expect("stream open").expect("read frame");
    assert_eq!(bye.into_data().as_ref(), b"bye");

    match ws.next().await {
        Some(Ok(tungstenite::Message::Close(_))) | None => {}
        Some(Ok(other)) => panic!("expected close, got {other:?}"),
        Some(Err(_)) => {} // server closed the connection
    }
}

#[tokio::test]
async fn disconnect_kills_harness() {
    let pidfile = std::env::temp_dir().join(format!(
        "acp-sidecar-test-pid-{}-{}",
        std::process::id(),
        UNIQUE.fetch_add(1, Ordering::Relaxed),
    ));
    let harness = fake_harness(&format!("echo $$ > {} && exec cat", pidfile.display()));
    let addr = serve(&harness).await;
    let mut ws = connect(addr).await.expect("ws connect");

    let pid = loop {
        if let Ok(contents) = std::fs::read_to_string(&pidfile)
            && !contents.trim().is_empty()
        {
            break contents.trim().to_owned();
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    };
    assert!(alive(&pid), "harness should be running while connected");

    ws.close(None).await.expect("close ws");
    for _ in 0..100 {
        if !alive(&pid) {
            return;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    panic!("harness still alive after disconnect");
}

/// `kill -0`: true while the process exists.
fn alive(pid: &str) -> bool {
    std::process::Command::new("kill")
        .args(["-0", pid])
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

#[derive(Clone)]
struct MockUpstream {
    replies: Arc<Mutex<VecDeque<MockReply>>>,
    calls: Arc<Mutex<Vec<ObservedUpstreamCall>>>,
}

#[derive(Clone)]
struct MockReply {
    status: StatusCode,
    body: MockBody,
    headers: Vec<(&'static str, &'static str)>,
}

#[derive(Clone)]
enum MockBody {
    Text(&'static str),
    StartsThenFails,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct ObservedUpstreamCall {
    accept: Option<String>,
    authorization: Option<String>,
    model: String,
    path: String,
    proxy_authorization: Option<String>,
    x_api_key: Option<String>,
}

impl MockReply {
    fn text(status: StatusCode, body: &'static str) -> Self {
        Self {
            status,
            body: MockBody::Text(body),
            headers: vec![("content-type", "text/event-stream")],
        }
    }

    fn starts_then_fails() -> Self {
        Self {
            status: StatusCode::OK,
            body: MockBody::StartsThenFails,
            headers: vec![("content-type", "text/event-stream")],
        }
    }
}

impl MockUpstream {
    fn new(replies: impl IntoIterator<Item = MockReply>) -> Self {
        Self {
            replies: Arc::new(Mutex::new(replies.into_iter().collect())),
            calls: Arc::new(Mutex::new(Vec::new())),
        }
    }

    fn calls(&self) -> Vec<ObservedUpstreamCall> {
        self.calls.lock().expect("calls lock").clone()
    }
}

async fn mock_upstream(State(mock): State<MockUpstream>, request: Request) -> Response {
    let (parts, body) = request.into_parts();
    let body = to_bytes(body, MAX_PROXY_REQUEST_BYTES)
        .await
        .expect("mock request body");
    let model = serde_json::from_slice::<Value>(&body)
        .ok()
        .and_then(|payload| {
            payload
                .get("model")
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .unwrap_or_else(|| "<invalid JSON>".to_owned());
    let header = |name: &str| {
        parts
            .headers
            .get(name)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned)
    };
    mock.calls
        .lock()
        .expect("calls lock")
        .push(ObservedUpstreamCall {
            accept: header("accept"),
            authorization: header("authorization"),
            model,
            path: parts.uri.path().to_owned(),
            proxy_authorization: header("proxy-authorization"),
            x_api_key: header("x-api-key"),
        });
    let reply = mock
        .replies
        .lock()
        .expect("replies lock")
        .pop_front()
        .unwrap_or_else(|| MockReply::text(StatusCode::INTERNAL_SERVER_ERROR, "unexpected call"));
    let MockReply {
        status,
        body,
        headers,
    } = reply;
    let mut response = match body {
        MockBody::Text(body) => (status, body).into_response(),
        MockBody::StartsThenFails => {
            let first_chunk = futures_util::stream::once(async {
                Ok::<Bytes, std::io::Error>(Bytes::from_static(b"data: first\\n\\n"))
            });
            let delayed_failure = futures_util::stream::once(async {
                tokio::time::sleep(Duration::from_millis(50)).await;
                Err::<Bytes, _>(std::io::Error::other("mock upstream stream failure"))
            });
            let stream = first_chunk.chain(delayed_failure);
            let mut response = Response::new(Body::from_stream(stream));
            *response.status_mut() = status;
            response
        }
    };
    for (name, value) in headers {
        response
            .headers_mut()
            .insert(name, HeaderValue::from_static(value));
    }
    response
}

async fn serve_proxy(replies: impl IntoIterator<Item = MockReply>) -> (SocketAddr, MockUpstream) {
    let upstream = MockUpstream::new(replies);
    let upstream_listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind mock upstream");
    let upstream_address = upstream_listener
        .local_addr()
        .expect("mock upstream address");
    tokio::spawn(
        axum::serve(
            upstream_listener,
            Router::new()
                .fallback(any(mock_upstream))
                .with_state(upstream.clone()),
        )
        .into_future(),
    );

    let proxy = ProxyConfig::from_values(
        &format!("http://{upstream_address}/conation-model-proxy/v1"),
        FIXED_FALLBACK_MODELS_TEXT,
        Some("sidecar-test-session-capability".to_owned()),
        "1000".to_owned(),
    )
    .expect("test proxy configuration");
    let config = Config::with_proxy(
        "unused-harness".to_owned(),
        "unused-workspace".to_owned(),
        proxy,
    );
    let proxy_listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind fallback proxy");
    let proxy_address = proxy_listener.local_addr().expect("fallback proxy address");
    tokio::spawn(axum::serve(proxy_listener, proxy_app(config)).into_future());
    (proxy_address, upstream)
}

async fn openai_request(proxy_address: SocketAddr, model: &str) -> reqwest::Response {
    reqwest::Client::builder()
        .no_proxy()
        .build()
        .expect("test HTTP client")
        .post(format!("http://{proxy_address}/v1/chat/completions"))
        .header("accept", "text/event-stream")
        .header("authorization", "Bearer client-secret-must-not-leak")
        .header("content-type", "application/json")
        .header(
            "proxy-authorization",
            "Basic client-proxy-secret-must-not-leak",
        )
        .header("x-api-key", "client-api-key-must-not-leak")
        .body(
            serde_json::json!({
                "messages": [{"content": "test", "role": "user"}],
                "model": model,
                "stream": true,
            })
            .to_string(),
        )
        .send()
        .await
        .expect("request fallback proxy")
}

#[tokio::test]
async fn retryable_provider_failures_advance_models_in_order_without_client_secret_headers() {
    let (proxy_address, upstream) = serve_proxy([
        MockReply::text(StatusCode::SERVICE_UNAVAILABLE, "first unavailable"),
        MockReply::text(StatusCode::TOO_MANY_REQUESTS, "second limited"),
        MockReply::text(StatusCode::OK, "data: complete\\n\\n"),
    ])
    .await;

    let response = openai_request(proxy_address, "gemini-2.5-flash").await;
    assert_eq!(response.status(), StatusCode::OK);
    let body = response.bytes().await.expect("streamed response");
    assert_eq!(body.as_ref(), b"data: complete\\n\\n");

    let calls = upstream.calls();
    assert_eq!(
        calls
            .iter()
            .map(|call| call.model.as_str())
            .collect::<Vec<_>>(),
        ["gemini-2.5-flash", "nemotron-3-ultra", "gpt-5.6-luna"]
    );
    assert!(
        calls
            .iter()
            .all(|call| call.path == "/conation-model-proxy/v1/chat/completions")
    );
    assert!(
        calls
            .iter()
            .all(|call| call.accept.as_deref() == Some("text/event-stream"))
    );
    assert!(calls.iter().all(
        |call| call.authorization.as_deref() == Some("Bearer sidecar-test-session-capability")
    ));
    assert!(calls.iter().all(|call| call.x_api_key.is_none()));
    assert!(calls.iter().all(|call| call.proxy_authorization.is_none()));
}

#[tokio::test]
async fn authentication_failures_never_advance_the_fallback_chain() {
    let (proxy_address, upstream) = serve_proxy([
        MockReply::text(StatusCode::UNAUTHORIZED, "unauthorized"),
        MockReply::text(StatusCode::FORBIDDEN, "forbidden"),
        MockReply::text(StatusCode::OK, "must remain unused"),
    ])
    .await;

    assert_eq!(
        openai_request(proxy_address, "gemini-2.5-flash")
            .await
            .status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        openai_request(proxy_address, "gemini-2.5-flash")
            .await
            .status(),
        StatusCode::FORBIDDEN
    );
    let calls = upstream.calls();
    assert_eq!(calls.len(), 2);
    assert!(calls.iter().all(|call| call.model == "gemini-2.5-flash"));
}

#[tokio::test]
async fn a_response_that_started_streaming_is_never_retried() {
    let (proxy_address, upstream) = serve_proxy([
        MockReply::starts_then_fails(),
        MockReply::text(StatusCode::OK, "fallback must remain unused"),
    ])
    .await;

    let response = openai_request(proxy_address, "gemini-2.5-flash").await;
    assert_eq!(response.status(), StatusCode::OK);
    let mut body = response.bytes_stream();
    let first_chunk = body
        .next()
        .await
        .expect("started response has a first chunk")
        .expect("first chunk is forwarded");
    assert_eq!(first_chunk.as_ref(), b"data: first\\n\\n");
    let _ = body.next().await;
    assert_eq!(upstream.calls().len(), 1, "a body failure must not retry");
}

#[tokio::test]
async fn an_unapproved_model_is_rejected_without_an_upstream_call() {
    let (proxy_address, upstream) = serve_proxy([
        MockReply::text(StatusCode::SERVICE_UNAVAILABLE, "custom model unavailable"),
        MockReply::text(StatusCode::OK, "must remain unused"),
    ])
    .await;

    assert_eq!(
        openai_request(proxy_address, "operator-selected-model")
            .await
            .status(),
        StatusCode::BAD_REQUEST
    );
    assert!(upstream.calls().is_empty());
}

#[test]
fn fallback_proxy_configuration_rejects_unsafe_overrides() {
    assert!(
        ProxyConfig::from_values(
            "http://api.rox.one/v1",
            FIXED_FALLBACK_MODELS_TEXT,
            None,
            "1000".to_owned(),
        )
        .is_err()
    );
    assert!(
        ProxyConfig::from_values(
            "https://token@api.rox.one/v1",
            FIXED_FALLBACK_MODELS_TEXT,
            None,
            "1000".to_owned(),
        )
        .is_err()
    );
    assert!(
        ProxyConfig::from_values(
            "https://model-proxy.example/conation-model-proxy/v1",
            "gemini-2.5-flash,../not-a-model",
            None,
            "1000".to_owned(),
        )
        .is_err()
    );
    assert!(
        ProxyConfig::from_values(
            "https://model-proxy.example/conation-model-proxy/v1",
            FIXED_FALLBACK_MODELS_TEXT,
            None,
            "999".to_owned(),
        )
        .is_err()
    );
    assert!(
        ProxyConfig::from_values(
            "http://127.0.0.1:9999/v1",
            "primary-model,secondary-model",
            None,
            "1000".to_owned(),
        )
        .is_err()
    );
    assert!(
        ProxyConfig::from_values(
            "http://127.0.0.1:9999/conation-model-proxy/v1",
            "primary-model,secondary-model",
            None,
            "1000".to_owned(),
        )
        .is_err()
    );
}
