use super::*;
use crate::outbound::daytona::RoxApiKey;
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
/// against what a deployed sandbox sees: the OmniRoute key that activates the
/// one model provider `container/opencode.json` enables, plus the egress
/// variables the clone and every outbound call go through. No GitHub
/// credential - the proxy holds that one.
#[test]
fn sandbox_env_carries_the_model_key_and_egress() {
    let env = sandbox_env(&RoxApiKey::new("test-rox-key".to_owned()), test_egress());

    assert!(env.contains(&("ROX_API_KEY".to_owned(), "test-rox-key".to_owned())));
    assert!(
        !env.iter()
            .any(|(key, _)| key == "GITHUB_TOKEN" || key == "REPO_URL")
    );
    for (key, value) in test_egress().environment() {
        assert!(env.contains(&(key, value)));
    }
}
