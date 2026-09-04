use super::*;

#[test]
fn renders_conation_brand_with_explicit_operator_values() {
    let message = build_user_invite_message(
        "Example Team",
        "https://workspace.example/app/?login=true",
        "help@workspace.example",
    );

    assert!(message.contains("присоединиться к Example Team в Conation"));
    assert!(message.contains("https://workspace.example/app/?login=true"));
    assert!(message.contains("mailto:help@workspace.example"));
    assert!(!message.contains("on Macro"));
    assert!(!message.contains("macro.com"));
    assert!(!message.contains("amazonaws.com"));
}
