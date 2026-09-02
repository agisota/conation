use std::collections::HashMap;

use super::*;

fn client(public_url: &str) -> FusionAuthOAuthClient {
    FusionAuthOAuthClient::new(
        "mcp-application".to_owned(),
        "mcp-client-secret".to_owned(),
        "http://fusionauth.internal:9011".to_owned(),
        "https://mcp.conation.dev/oauth/callback".to_owned(),
    )
    .with_public_url(public_url.to_owned())
}

#[test]
fn native_authorize_url_omits_identity_provider_hint() {
    let url = client("https://auth.conation.dev")
        .construct_authorize_url(Some("mcp-session"))
        .expect("valid public origin should construct an OAuth URL");
    let url = reqwest::Url::parse(&url).expect("OAuth URL should parse");
    let query: HashMap<_, _> = url.query_pairs().into_owned().collect();

    assert_eq!(url.path(), "/oauth2/authorize");
    assert_eq!(query.get("client_id"), Some(&"mcp-application".to_owned()));
    assert_eq!(
        query.get("redirect_uri"),
        Some(&"https://mcp.conation.dev/oauth/callback".to_owned())
    );
    assert_eq!(query.get("response_type"), Some(&"code".to_owned()));
    assert!(!query.contains_key("idp_hint"));
}

#[test]
fn invalid_public_url_returns_an_error() {
    let error = client("not a URL")
        .construct_authorize_url(Some("mcp-session"))
        .expect_err("invalid public URLs must not panic or emit an OAuth redirect");

    assert!(error.to_string().contains("invalid FusionAuth public URL"));
}
