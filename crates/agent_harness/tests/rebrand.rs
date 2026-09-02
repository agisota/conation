#[test]
fn sandbox_system_prompt_uses_conation_display_brand() {
    let prompt = include_str!("../container/SYSTEM.md");

    assert!(prompt.contains("You are Conation Coding Agent"));
    assert!(prompt.contains("deployed from the Conation platform"));
    assert!(prompt.contains("Conation is a unified chat"));
    assert!(!prompt.contains("You are Macro Coding Agent"));
    assert!(!prompt.contains("deployed from the Macro platform"));
    assert!(!prompt.contains("Macro is a unified chat"));
}
