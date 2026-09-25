use super::{macro_mcp_endpoint, sandboxed_fixed_runtimes, PgAgentRuntimeDirectory};
use macro_service_urls::McpServiceUrl;
use agent_harness::domain::model::AgentKind;
use agent_harness::domain::ports::AgentRuntimeDirectory;
use bot_id::{BotId, MACRO_CODER_BOT_ID};
use bots::outbound::pg_bots_repo::PgBotsRepo;
use sqlx::postgres::PgPoolOptions;

#[test]
fn macro_mcp_endpoint_preserves_the_gateway_prefix() {
    for (base, expected) in [
        (McpServiceUrl::local(), "http://localhost:8080/mcp"),
        (
            McpServiceUrl::dev(),
            "https://dev-gateway.macro.com/mcp/mcp",
        ),
        (McpServiceUrl::prod(), "https://gateway.macro.com/mcp/mcp"),
    ] {
        assert_eq!(macro_mcp_endpoint(&base).unwrap().as_str(), expected);
    }
}

#[test]
fn macro_mcp_endpoint_appends_to_overridden_bases_with_or_without_a_trailing_slash() {
    for base in ["http://mcp-service:8080", "http://mcp-service:8080/"] {
        assert_eq!(
            macro_mcp_endpoint(&McpServiceUrl::from_static(base))
                .unwrap()
                .as_str(),
            "http://mcp-service:8080/mcp"
        );
    }
    assert_eq!(
        macro_mcp_endpoint(&McpServiceUrl::from_static(
            "https://example.com/proxy/mcp/"
        ))
        .unwrap()
        .as_str(),
        "https://example.com/proxy/mcp/mcp"
    );
}

#[test]
fn macro_mcp_endpoint_rejects_an_invalid_base_url() {
    assert!(macro_mcp_endpoint(&McpServiceUrl::from_static("not a url")).is_err());
}

#[tokio::test]
async fn replicas_resolve_the_system_coder_profile_without_a_bot_row_fallback() {
    let configured_bot = BotId::new_from_uuid(macro_uuid::Uuid::from_u128(0xfedc));
    let fixed = sandboxed_fixed_runtimes(
        configured_bot,
        "test-model".to_owned(),
        "opencode".to_owned(),
    );
    let pool = PgPoolOptions::new()
        .connect_lazy("postgres://postgres:postgres@localhost/agent-harness-runtime-test")
        .expect("test database URL should be valid");
    let directory = PgAgentRuntimeDirectory::new(PgBotsRepo::new(pool), fixed);

    let runtime = directory
        .runtime_for(MACRO_CODER_BOT_ID)
        .await
        .expect("the fixed profile resolves without a database lookup")
        .expect("the system coder profile is present on every replica");

    assert_eq!(runtime.kind, AgentKind::SandboxedCoder);
    assert_eq!(runtime.harness, "opencode");
}

#[test]
fn queued_command_outcome_keeps_the_durable_trigger_pending() {
    assert!(matches!(
        super::trigger_work_after_command(agent_harness::domain::model::CommandOutcome::Queued),
        super::TriggerWorkDisposition::Queued
    ));
    assert!(matches!(
        super::trigger_work_after_command(agent_harness::domain::model::CommandOutcome::Completed),
        super::TriggerWorkDisposition::Complete
    ));
}

#[tokio::test]
async fn another_bot_worker_can_start_while_the_first_worker_is_blocked() {
    let bot_a = bot_id::MACRO_NEW_BOT_ID;
    let bot_b = bot_id::MACRO_CODER_BOT_ID;
    let mut workers = tokio::task::JoinSet::new();
    let (release_a, wait_for_release_a) = tokio::sync::oneshot::channel();
    let (started_a, wait_for_start_a) = tokio::sync::oneshot::channel();
    workers.spawn(async move {
        started_a.send(bot_a).unwrap();
        wait_for_release_a.await.unwrap();
    });
    assert_eq!(wait_for_start_a.await.unwrap(), bot_a);
    assert!(super::trigger_worker_has_capacity(&workers));

    let (started_b, wait_for_start_b) = tokio::sync::oneshot::channel();
    workers.spawn(async move {
        started_b.send(bot_b).unwrap();
    });
    assert_eq!(wait_for_start_b.await.unwrap(), bot_b);

    release_a.send(()).unwrap();
    while workers.join_next().await.is_some() {}
}

#[test]
fn missing_session_ends_trigger_processing_but_other_lookup_errors_retry() {
    let missing_id = agent_session::domain::model::AgentSessionId::new();
    assert!(matches!(
        super::classify_session_lookup_failure(
            agent_session::domain::error::AgentSessionError::SessionNotFound(missing_id)
        ),
        Ok(super::TriggerWorkDisposition::Terminal(_))
    ));
    assert!(matches!(
        super::classify_trigger_failure(
            agent_harness::domain::error::HarnessError::Session(
                agent_session::domain::error::AgentSessionError::SessionNotFound(missing_id)
            )
        ),
        Ok(super::TriggerWorkDisposition::Terminal(_))
    ));
    assert!(
        super::classify_session_lookup_failure(
            agent_session::domain::error::AgentSessionError::Unknown(anyhow::anyhow!(
                "database unavailable"
            ))
        )
        .is_err(),
        "non-not-found repository failures must remain retryable"
    );
}

#[test]
fn forbidden_trigger_failure_is_terminal_so_later_authorized_work_can_run() {
    assert!(matches!(
        super::classify_trigger_failure(agent_harness::domain::error::HarnessError::Session(
            agent_session::domain::error::AgentSessionError::Forbidden
        )),
        Ok(super::TriggerWorkDisposition::Terminal(_))
    ));
}
