use uuid::Uuid;

use super::PopulateJwtWebhookResponse;

#[test]
fn response_serializes_root_conation_id() {
    let root_macro_id = Uuid::from_u128(1);
    let response = PopulateJwtWebhookResponse {
        user_id: "fusion-user".to_string(),
        organization_id: Some(42),
        root_macro_id: Some(root_macro_id),
    };

    let value = serde_json::to_value(response).unwrap();

    assert_eq!(value["root_conation_id"], root_macro_id.to_string());
    assert!(value.get("root_macro_id").is_none());
}

#[test]
fn response_rejects_legacy_root_macro_id() {
    let root_macro_id = Uuid::from_u128(1);
    let response = serde_json::from_value::<PopulateJwtWebhookResponse>(serde_json::json!({
        "user_id": "fusion-user",
        "organization_id": 42,
        "root_macro_id": root_macro_id
    }));

    assert!(response.is_err());
}
