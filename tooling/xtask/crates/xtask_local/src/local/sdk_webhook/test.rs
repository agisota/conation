use super::*;

use crate::local::instance::Instance;

#[test]
fn start_surfaces_ssh_stderr() {
    let instance = Instance::derive(
        Some(&format!("sdk-wh-{}", std::process::id())),
        Some(31_000),
    )
    .unwrap();
    let err = start(&instance).unwrap_err().to_string();
    let _ = std::fs::remove_dir_all(instance.artifact_dir());
    assert!(
        err.contains("Connection refused") || err.to_ascii_lowercase().contains("ssh:"),
        "expected the real ssh error, got {err}"
    );
}
