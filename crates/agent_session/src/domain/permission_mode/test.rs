use super::*;

#[test]
fn defaults_to_ask() {
    assert_eq!(SessionPermissionMode::default(), SessionPermissionMode::Ask);
}

#[test]
fn round_trips_json_as_lowercase_names() {
    assert_eq!(
        serde_json::to_value(SessionPermissionMode::Ask).unwrap(),
        serde_json::json!("ask")
    );
    assert_eq!(
        serde_json::from_value::<SessionPermissionMode>(serde_json::json!("yolo")).unwrap(),
        SessionPermissionMode::Yolo
    );
    assert_eq!(
        serde_json::from_value::<SessionPermissionMode>(serde_json::json!("task")).unwrap(),
        SessionPermissionMode::Task
    );
    assert_eq!(
        serde_json::from_value::<SessionPermissionMode>(serde_json::json!("control")).unwrap(),
        SessionPermissionMode::Control
    );
}

#[test]
fn omitted_json_field_is_ask() {
    #[derive(serde::Deserialize)]
    struct Body {
        #[serde(default)]
        permission_mode: SessionPermissionMode,
    }
    let body: Body = serde_json::from_value(serde_json::json!({})).unwrap();
    assert_eq!(body.permission_mode, SessionPermissionMode::Ask);
}
