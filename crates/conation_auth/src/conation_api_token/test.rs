use crate::middleware::decode_jwt::MacroAccessToken;

use super::MacroApiToken;

#[test]
fn token_claims_serialize_with_stable_macro_names() {
    let api_token = MacroApiToken {
        exp: 1,
        iss: "issuer".to_string(),
        fusion_user_id: "fusion-user".to_string(),
        macro_user_id: "macro|user@example.com".to_string(),
        macro_organization_id: Some(42),
    };
    let access_token = MacroAccessToken {
        aud: "audience".to_string(),
        exp: 1,
        tid: "tenant".to_string(),
        iss: "issuer".to_string(),
        email: "user@example.com".to_string(),
        fusion_user_id: "fusion-user".to_string(),
        macro_user_id: "macro|user@example.com".to_string(),
        macro_organization_id: Some(42),
        root_macro_id: Some("root-user".to_string()),
    };

    let api_claims = serde_json::to_value(api_token).unwrap();
    let access_claims = serde_json::to_value(access_token).unwrap();

    assert_eq!(access_claims["root_macro_id"], "root-user");
    assert!(access_claims.get("root_conation_id").is_none());

    for claims in [&api_claims, &access_claims] {
        assert_eq!(claims["macro_user_id"], "macro|user@example.com");
        assert_eq!(claims["macro_organization_id"], 42);
        assert!(claims.get("conation_user_id").is_none());
        assert!(claims.get("conation_organization_id").is_none());
    }
}

#[test]
fn token_claims_accept_transitional_conation_aliases() {
    let api_token: MacroApiToken = serde_json::from_value(serde_json::json!({
        "exp": 1,
        "iss": "issuer",
        "fusion_user_id": "fusion-user",
        "conation_user_id": "macro|user@example.com",
        "conation_organization_id": 42
    }))
    .unwrap();
    let access_token: MacroAccessToken = serde_json::from_value(serde_json::json!({
        "aud": "audience",
        "exp": 1,
        "tid": "tenant",
        "iss": "issuer",
        "email": "user@example.com",
        "fusion_user_id": "fusion-user",
        "conation_user_id": "macro|user@example.com",
        "conation_organization_id": 42,
        "root_conation_id": "root-user"
    }))
    .unwrap();

    assert_eq!(api_token.macro_user_id, "macro|user@example.com");
    assert_eq!(api_token.macro_organization_id, Some(42));
    assert_eq!(access_token.macro_user_id, "macro|user@example.com");
    assert_eq!(access_token.macro_organization_id, Some(42));
    assert_eq!(access_token.root_macro_id.as_deref(), Some("root-user"));
}
