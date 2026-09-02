use super::*;

use crate::domain::ports::OAuthProvider;
use url::Url;
use wiremock::{Mock, MockServer, ResponseTemplate, matchers};

fn client(base_url: &str) -> fusionauth::oauth::FusionAuthOAuthClient {
    fusionauth::oauth::FusionAuthOAuthClient::new(
        "mcp-application".to_owned(),
        "mcp-client-secret".to_owned(),
        base_url.to_owned(),
        "https://mcp.conation.dev/oauth/callback".to_owned(),
    )
    .with_public_url(base_url.to_owned())
}

#[tokio::test]
async fn starts_without_google_identity_provider_lookup() {
    let server = MockServer::start().await;
    let provider = FusionAuthOAuthProvider::new(client(&server.uri()));

    let authorize_url = provider
        .construct_authorize_url("mcp-session")
        .expect("native FusionAuth authorization URL should be valid");
    let authorize_url = Url::parse(&authorize_url).expect("authorization URL should parse");
    let query = authorize_url
        .query_pairs()
        .collect::<std::collections::HashMap<_, _>>();

    assert_eq!(authorize_url.path(), "/oauth2/authorize");
    assert_eq!(
        query.get("client_id").map(|value| value.as_ref()),
        Some("mcp-application")
    );
    assert_eq!(
        query.get("redirect_uri").map(|value| value.as_ref()),
        Some("https://mcp.conation.dev/oauth/callback")
    );
    assert_eq!(
        query.get("response_type").map(|value| value.as_ref()),
        Some("code")
    );
    assert!(
        !query.contains_key("idp_hint"),
        "MCP must use FusionAuth's native login, not a Gmail-specific IdP"
    );
    assert!(
        server
            .received_requests()
            .await
            .expect("request capture should succeed")
            .is_empty(),
        "provider construction and authorization URL generation must not look up google_gmail"
    );
}

#[tokio::test]
async fn invalid_authorization_code_fails_without_tokens() {
    let server = MockServer::start().await;
    Mock::given(matchers::method("POST"))
        .and(matchers::path("/oauth2/token"))
        .respond_with(ResponseTemplate::new(400).set_body_string("invalid_grant"))
        .mount(&server)
        .await;
    let provider = FusionAuthOAuthProvider::new(client(&server.uri()));

    let result = provider
        .exchange_authorization_code("invalid-user-code")
        .await;

    assert!(
        result.is_err(),
        "an invalid FusionAuth authorization code must not be converted into MCP bearer tokens"
    );
    let requests = server
        .received_requests()
        .await
        .expect("request capture should succeed");
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].url.path(), "/oauth2/token");
}
