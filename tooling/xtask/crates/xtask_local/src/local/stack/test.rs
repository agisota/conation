use super::*;

/// `up` writes stack.json and `update`/`status` read it back — the record and
/// the mode labels must stay in agreement.
#[test]
fn stack_state_roundtrips() {
    let state = StackState {
        mode: "local".to_string(),
        frontend: "static".to_string(),
        binaries_dir: Some(PathBuf::from("/tmp/binaries")),
        auth_key_fingerprint: Some("fingerprint".to_string()),
        mcp_credentials_key_fingerprint: Some("mcp-fingerprint".to_string()),
        git_revision: Some("revision".to_string()),
        git_tree_clean: Some(true),
    };
    let json = serde_json::to_string(&state).unwrap();
    let back: StackState = serde_json::from_str(&json).unwrap();
    assert_eq!(back.mode, "local");
    assert_eq!(back.frontend, "static");
    assert_eq!(back.binaries_dir, Some(PathBuf::from("/tmp/binaries")));
    assert_eq!(back.auth_key_fingerprint.as_deref(), Some("fingerprint"));
    assert_eq!(back.mcp_credentials_key_fingerprint.as_deref(), Some("mcp-fingerprint"));
    assert_eq!(back.git_revision.as_deref(), Some("revision"));
    assert_eq!(back.git_tree_clean, Some(true));
    assert!(mode_from_label(&back.mode).is_ok());
    assert!(mode_from_label("nonsense").is_err());
}

#[test]
fn legacy_stack_state_has_no_binaries_dir_or_auth_key_fingerprint() {
    let state: StackState =
        serde_json::from_str(r#"{"mode":"local","frontend":"static"}"#).unwrap();
    assert_eq!(state.binaries_dir, None);
    assert_eq!(state.auth_key_fingerprint, None);
    assert_eq!(state.mcp_credentials_key_fingerprint, None);
    assert_eq!(state.git_revision, None);
    assert_eq!(state.git_tree_clean, None);
}

#[test]
fn clearing_state_invalidates_a_previous_headless_stack() {
    let instance =
        Instance::derive(Some(&format!("state-clear-{}", std::process::id())), None).unwrap();
    write_state(
        &instance,
        &StackState {
            mode: "local".to_string(),
            frontend: "static".to_string(),
            binaries_dir: None,
            auth_key_fingerprint: None,
            mcp_credentials_key_fingerprint: None,
            git_revision: None,
            git_tree_clean: None,
        },
    )
    .unwrap();
    assert!(read_state(&instance).is_some());
    clear_state(&instance).unwrap();
    assert!(read_state(&instance).is_none());
    clear_state(&instance).unwrap();
    let _ = std::fs::remove_dir_all(instance.artifact_dir());
}
