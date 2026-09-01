use super::*;

#[test]
fn renders_conation_brand_with_production_compatibility_url() {
    let message = build_user_invite_message("Example Team", "prod");

    assert!(message.contains("join Example Team on Conation"));
    assert!(message.contains("https://macro.com/app/?login=true"));
    assert!(message.contains("alt=\"Conation\""));
    assert!(!message.contains("on Macro"));
}

#[test]
fn preserves_environment_specific_compatibility_url() {
    let message = build_user_invite_message("Example Team", "staging");

    assert!(message.contains("https://staging.macro.com/app/?login=true"));
}
