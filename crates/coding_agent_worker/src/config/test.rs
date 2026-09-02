use super::*;

const EXAMPLE: &str = include_str!("../../config.example.toml");

#[test]
fn the_example_config_parses() {
    let config: Config = toml::from_str(EXAMPLE).expect("example config parses");
    assert_eq!(config.harness.command, "opencode");
    assert_eq!(config.harness.args, vec!["acp"]);
    assert_eq!(config.server.port, 8790);
    assert_eq!(config.conation_api.bot_scope, "user");
    assert_eq!(config.server.signing_secret, None);
    assert_eq!(
        config.server.public_url,
        "http://sdk-webhook-relay:8787/conation-events"
    );
}

#[test]
fn unknown_fields_are_rejected() {
    let with_typo = EXAMPLE.replace("repo_url", "repo_uri");
    assert!(toml::from_str::<Config>(&with_typo).is_err());
}

#[test]
fn the_legacy_macro_config_section_is_rejected() {
    let legacy = EXAMPLE.replacen("[conation]", "[macro]", 1);
    assert!(toml::from_str::<Config>(&legacy).is_err());
}

#[test]
fn args_and_scope_default() {
    let trimmed = EXAMPLE
        .replace("args = [\"acp\"]\n", "")
        .replace("bot_scope = \"user\"\n", "");
    let config: Config = toml::from_str(&trimmed).expect("args and scope are optional");
    assert!(config.harness.args.is_empty());
    assert_eq!(config.conation_api.bot_scope, "user");
}

#[test]
fn the_gateway_url_is_the_api_base_with_a_websocket_scheme() {
    let config: Config = toml::from_str(EXAMPLE).expect("example config parses");
    assert_eq!(
        config.conation_api.gateway_url(),
        "ws://localhost:50009/agent-harness/runtime/ws",
    );

    let secure = ConationApi {
        api_url: "https://agent-harness.conation.dev/".to_owned(),
        storage_url: "https://storage.conation.dev".to_owned(),
        owner_user_id: "conation|owner@conation.dev".to_owned(),
        bot_token: "mbot_x".to_owned(),
        bot_scope: "user".to_owned(),
    };
    assert_eq!(
        secure.gateway_url(),
        "wss://agent-harness.conation.dev/runtime/ws",
    );
}
