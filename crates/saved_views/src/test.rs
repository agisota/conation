use super::PersonalDashboardConfig;
use serde_json::{Value, json};

fn valid() -> Value {
    json!({
        "kind": "dashboard", "id": "dashboard:personal", "version": 1,
        "revision": 1, "preset": "focus", "widgets": ["tasks", "calendar"]
    })
}

#[test]
fn accepts_only_the_expected_revision_and_unique_allowlisted_widgets() {
    assert!(PersonalDashboardConfig::parse(valid(), 0).is_ok());
    assert!(PersonalDashboardConfig::parse(valid(), 1).is_err());
    let mut duplicate = valid();
    duplicate["widgets"] = json!(["tasks", "tasks"]);
    assert!(PersonalDashboardConfig::parse(duplicate, 0).is_err());
    let mut unknown = valid();
    unknown["widgets"] = json!(["email"]);
    assert!(PersonalDashboardConfig::parse(unknown, 0).is_err());
}

#[test]
fn rejects_legacy_team_keys_in_a_full_personal_replacement() {
    let mut legacy = valid();
    legacy["teamDefault"] = json!(true);
    assert!(PersonalDashboardConfig::parse(legacy, 0).is_err());
}
