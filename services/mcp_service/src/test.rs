use std::sync::Arc;

use axum::body::Body;
use http::{Method, Request, StatusCode, header::CONTENT_TYPE};
use rmcp::{
    handler::server::ServerHandler,
    model::{ServerCapabilities, ServerInfo},
    transport::streamable_http_server::{
        StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
    },
};
use serde_json::json;

use super::*;

#[derive(Clone)]
struct TestHandler;

impl ServerHandler for TestHandler {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().build())
    }
}

async fn status_for_host(host: &str, environment: config::Environment) -> StatusCode {
    let allowed_hosts =
        mcp_allowed_hosts("https://mcp.conation.dev", environment).expect("valid test public URL");
    if let Err(error) = validate_mcp_authority(host, &allowed_hosts) {
        return match error {
            HostValidationError::Malformed => StatusCode::BAD_REQUEST,
            HostValidationError::Forbidden => StatusCode::FORBIDDEN,
        };
    }
    let service = StreamableHttpService::new(
        || Ok(TestHandler),
        Arc::new(LocalSessionManager::default()),
        StreamableHttpServerConfig::default()
            .with_allowed_hosts(allowed_hosts)
            .with_stateful_mode(false)
            .with_json_response(true),
    );
    let body = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": { "name": "host-policy-test", "version": "1.0.0" }
        }
    });
    let request = Request::builder()
        .method(Method::POST)
        .header("accept", "application/json, text/event-stream")
        .header(CONTENT_TYPE, "application/json")
        .header("host", host)
        .body(Body::from(body.to_string()))
        .expect("valid host-policy request");

    service.handle(request).await.status()
}

#[tokio::test]
async fn local_internal_authority_is_exact_and_port_scoped() {
    assert_eq!(
        status_for_host(LOCAL_MCP_INTERNAL_AUTHORITY, config::Environment::Local).await,
        StatusCode::OK
    );
    for rejected in [
        "mcp-service",
        "mcp-service:8081",
        "mcp-service.evil:8080",
        "evil-mcp-service:8080",
    ] {
        assert_eq!(
            status_for_host(rejected, config::Environment::Local).await,
            StatusCode::FORBIDDEN,
            "lookalike or wrong-port authority must be rejected: {rejected}"
        );
    }
}

#[tokio::test]
async fn malformed_userinfo_authority_is_rejected() {
    let status = status_for_host("user@mcp-service:8080", config::Environment::Local).await;
    assert!(
        matches!(status, StatusCode::BAD_REQUEST | StatusCode::FORBIDDEN),
        "userinfo authority must not be accepted: {status}"
    );
}

#[tokio::test]
async fn deployed_environments_do_not_allow_the_compose_authority() {
    for environment in [
        config::Environment::Develop,
        config::Environment::Production,
    ] {
        assert_eq!(
            status_for_host(LOCAL_MCP_INTERNAL_AUTHORITY, environment).await,
            StatusCode::FORBIDDEN
        );
    }
    assert_eq!(
        status_for_host("mcp.conation.dev", config::Environment::Production).await,
        StatusCode::OK
    );
    assert_eq!(
        status_for_host("mcp.conation.dev:443", config::Environment::Production).await,
        StatusCode::FORBIDDEN
    );
}

#[test]
fn public_url_must_be_a_root_origin_without_userinfo() {
    for rejected in [
        "https://user@mcp.conation.dev",
        "https://mcp.conation.dev/mcp",
        "https://mcp.conation.dev/?tenant=one",
        "ftp://mcp.conation.dev",
    ] {
        assert!(
            mcp_allowed_hosts(rejected, config::Environment::Production).is_err(),
            "invalid public URL must be rejected: {rejected}"
        );
    }

    let local = mcp_allowed_hosts("http://localhost:8090", config::Environment::Local)
        .expect("local proxy origin");
    assert_eq!(validate_mcp_authority("localhost:8090", &local), Ok(()));
    assert_eq!(
        validate_mcp_authority("localhost:8091", &local),
        Err(HostValidationError::Forbidden)
    );
}
