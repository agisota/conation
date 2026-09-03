use crate::model::router::*;
use rig_core::providers::{anthropic, openai};

#[test]
fn conation_default_chain_is_verified_rox_catalog_order() {
    assert_eq!(
        DEFAULT_ROX_MODEL_CHAIN,
        [
            "rox/gemini-2.5-flash",
            "rox/nemotron-3-ultra",
            "rox/gpt-5.6-luna",
        ]
    );
    assert_eq!(DEFAULT_ROX_MODEL, DEFAULT_ROX_MODEL_CHAIN[0]);
}

fn test_router() -> ModelRouter {
    let anthropic = anthropic::Client::builder()
        .api_key("test-anthropic-key")
        .build()
        .unwrap();
    let openai = openai::Client::builder()
        .api_key("test-openai-key")
        .build()
        .unwrap();
    let compatible = openai::CompletionsClient::builder()
        .api_key("test-compatible-key")
        .base_url("http://localhost:11434/v1")
        .build()
        .unwrap();

    ModelRouter::new(anthropic, openai).with_openai_client("local", compatible)
}

#[test]
fn openai_provider_routes_to_responses() {
    let router = test_router();

    assert!(matches!(
        router.route("openai/gpt-5.5").unwrap(),
        RoutedModel::OpenAiResponses(_)
    ));
}

#[test]
fn registered_openai_compatible_provider_routes_to_chat_completions() {
    let router = test_router();

    assert!(matches!(
        router.route("local/llama-3.3-70b").unwrap(),
        RoutedModel::OpenAiChatCompletions(_)
    ));
}

#[test]
fn default_candidates_fall_forward_without_restarting_the_chain() {
    let router = test_router();

    assert_eq!(
        router.candidate_model_ids("rox/gemini-2.5-flash"),
        DEFAULT_ROX_MODEL_CHAIN
    );
    assert_eq!(
        router.candidate_model_ids("rox/nemotron-3-ultra"),
        ["rox/nemotron-3-ultra", "rox/gpt-5.6-luna"]
    );
    assert_eq!(
        router.candidate_model_ids("unknown/model"),
        DEFAULT_ROX_MODEL_CHAIN
    );
    assert_eq!(
        router.candidate_model_ids("local/llama-3.3-70b"),
        ["local/llama-3.3-70b"]
    );
}

#[test]
fn fallback_http_policy_distinguishes_retry_skip_and_terminal_errors() {
    for status in [408, 409, 425, 429, 500, 502, 599] {
        assert_eq!(
            classify_status(status),
            FailureDisposition::RetryThenFallback,
            "status {status}"
        );
    }
    for status in [404, 422] {
        assert_eq!(
            classify_status(status),
            FailureDisposition::Fallback,
            "status {status}"
        );
    }
    for status in [400, 401, 403, 405, 413] {
        assert_eq!(
            classify_status(status),
            FailureDisposition::Stop,
            "status {status}"
        );
    }
}

#[test]
fn fallback_chain_override_rejects_empty_or_malformed_ids() {
    assert!(test_router().with_fallback_chain(Vec::new()).is_err());
    assert!(
        test_router()
            .with_fallback_chain(vec!["bare-model".to_owned()])
            .is_err()
    );
}
