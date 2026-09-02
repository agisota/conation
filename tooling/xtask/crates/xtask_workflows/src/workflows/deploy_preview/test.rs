use super::*;

fn rendered() -> String {
    deploy_preview()
        .to_string()
        .expect("workflow should serialize")
}

#[test]
fn deploy_requires_a_same_repository_owner_pull_request() {
    let yaml = rendered();
    assert!(
        yaml.contains("github.event.pull_request.head.repo.full_name == github.repository"),
        "{yaml}"
    );
    assert!(
        yaml.contains("github.event.pull_request.author_association == 'OWNER'"),
        "{yaml}"
    );
}

#[test]
fn branch_name_reaches_the_script_only_through_environment() {
    let yaml = rendered();
    assert!(yaml.contains("--branch \"$BRANCH\""), "{yaml}");
    assert!(yaml.contains("BRANCH: ${{ github.head_ref }}"), "{yaml}");
    assert!(
        !yaml.contains("--branch \"${{ github.head_ref }}\""),
        "branch name must not be interpolated into shell source: {yaml}"
    );
}
