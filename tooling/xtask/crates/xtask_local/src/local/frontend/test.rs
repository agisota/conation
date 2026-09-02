use super::frontend_build_node_options;

#[test]
fn static_frontend_build_gets_a_safe_default_heap() {
    assert_eq!(
        frontend_build_node_options(None),
        "--max-old-space-size=8192"
    );
    assert_eq!(
        frontend_build_node_options(Some("--trace-warnings")),
        "--trace-warnings --max-old-space-size=8192"
    );
}

#[test]
fn static_frontend_build_preserves_an_operator_heap_limit() {
    assert_eq!(
        frontend_build_node_options(Some("--max-old-space-size=6144 --trace-warnings")),
        "--max-old-space-size=6144 --trace-warnings"
    );
}
