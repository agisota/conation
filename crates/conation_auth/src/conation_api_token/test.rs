use crate::middleware::decode_jwt::MacroAccessToken;

use super::ConationApiToken;

#[test]
fn token_claims_serialize_with_conation_names() {
    let api_token = ConationApiToken {
        exp: 1,
        iss: "issuer".to_string(),
        fusion_user_id: "fusion-user".to_string(),
        macro_user_id: "conation|user@example.com".to_string(),
        macro_organization_id: Some(42),
    };
    let access_token = MacroAccessToken {
        aud: "audience".to_string(),
        exp: 1,
        tid: "tenant".to_string(),
        iss: "issuer".to_string(),
        email: "user@example.com".to_string(),
        fusion_user_id: "fusion-user".to_string(),
        macro_user_id: "conation|user@example.com".to_string(),
        macro_organization_id: Some(42),
        root_macro_id: Some("root-user".to_string()),
    };

    let api_claims = serde_json::to_value(api_token).unwrap();
    let access_claims = serde_json::to_value(access_token).unwrap();

    assert_eq!(access_claims["root_conation_id"], "root-user");
    assert!(access_claims.get("root_macro_id").is_none());

    for claims in [&api_claims, &access_claims] {
        assert_eq!(claims["conation_user_id"], "conation|user@example.com");
        assert_eq!(claims["conation_organization_id"], 42);
        assert!(claims.get("macro_user_id").is_none());
        assert!(claims.get("macro_organization_id").is_none());
    }
}

#[test]
fn token_claims_reject_legacy_macro_names() {
    let api_token = serde_json::from_value::<ConationApiToken>(serde_json::json!({
        "exp": 1,
        "iss": "issuer",
        "fusion_user_id": "fusion-user",
        "macro_user_id": "conation|user@example.com",
        "macro_organization_id": 42
    }));
    let access_token = serde_json::from_value::<MacroAccessToken>(serde_json::json!({
        "aud": "audience",
        "exp": 1,
        "tid": "tenant",
        "iss": "issuer",
        "email": "user@example.com",
        "fusion_user_id": "fusion-user",
        "macro_user_id": "conation|user@example.com",
        "macro_organization_id": 42,
        "root_macro_id": "root-user"
    }));

    assert!(api_token.is_err());
    assert!(access_token.is_err());
}
