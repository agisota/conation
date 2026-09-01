use uuid::Uuid;

use super::PopulateJwtWebhookResponse;

#[test]
fn response_serializes_stable_root_macro_id() {
    let root_macro_id = Uuid::from_u128(1);
    let response = PopulateJwtWebhookResponse {
        user_id: "fusion-user".to_string(),
        organization_id: Some(42),
        root_macro_id: Some(root_macro_id),
    };

    let value = serde_json::to_value(response).unwrap();

    assert_eq!(value["root_macro_id"], root_macro_id.to_string());
    assert!(value.get("root_conation_id").is_none());
}

#[test]
fn response_accepts_transitional_root_conation_id_alias() {
    let root_macro_id = Uuid::from_u128(1);
    let response: PopulateJwtWebhookResponse = serde_json::from_value(serde_json::json!({
        "user_id": "fusion-user",
        "organization_id": 42,
        "root_conation_id": root_macro_id
    }))
    .unwrap();

    assert_eq!(response.root_macro_id, Some(root_macro_id));
}
