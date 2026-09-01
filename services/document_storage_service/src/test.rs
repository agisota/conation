use super::*;

#[test]
fn agent_tool_context_error_uses_conation_display_brand() {
    assert_eq!(
        AGENT_TOOL_CONTEXT_BUILD_ERROR,
        "failed to build Conation agent tool context"
    );
    assert!(!AGENT_TOOL_CONTEXT_BUILD_ERROR.contains("Macro agent"));
}
