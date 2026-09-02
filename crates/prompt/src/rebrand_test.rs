use super::*;

#[test]
fn agent_prompts_use_conation_without_rewriting_runtime_urls() {
    let channel = channel_mention::PROMPT.to_string();
    let session = agent_session::PROMPT.to_string();
    let mcp = mcp_instructions("https://macro.com");

    assert!(channel.contains("You are Conation"));
    assert!(!channel.contains("You are Macro"));
    assert!(session.contains("Conation's agent"));
    assert!(mcp.contains("Linking to and listing Conation items"));
    assert!(mcp.contains("https://macro.com/app/<type>/<id>"));
}
