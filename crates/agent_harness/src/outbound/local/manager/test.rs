use super::*;
use crate::testing::helpers::egress::test_egress;

/// One container per session, so a resume finds exactly one and `docker ps`
/// says which session it belongs to.
#[test]
fn a_session_names_one_container() {
    let session = AgentSessionId::TEST_A;

    assert_eq!(container_name(session), format!("conation-agent-{session}"));
}

/// On a shared network the sidecar keeps its own port and the container name
/// is its DNS name.
#[test]
fn a_sidecar_is_dialed_by_container_name() {
    assert_eq!(
        sidecar_address(&ContainerRef {
            name: "conation-agent-abc".to_owned(),
        }),
        format!("conation-agent-abc:{}", provision::SIDECAR_PORT)
    );
}

/// Same environment Daytona injects, so the readiness recipe is exercised
/// against what a deployed sandbox sees: session-scoped egress capabilities
/// only. No deployment credential, GitHub token, or repository URL is handed
/// to model-authored code.
#[test]
fn sandbox_env_carries_only_egress() {
    let env = sandbox_env(test_egress());

    assert!(
        !env.iter()
            .any(|(key, _)| key == "ROX_API_KEY" || key == "GITHUB_TOKEN" || key == "REPO_URL")
    );
    for (key, value) in test_egress().environment() {
        assert!(env.contains(&(key, value)));
    }
}
