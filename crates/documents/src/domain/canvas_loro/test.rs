use super::*;

#[test]
fn empty_board_round_trips() {
    let json = r#"{"nodes":[],"edges":[]}"#;
    let snapshot = snapshot_from_json(json).expect("encode");
    assert!(!snapshot.is_empty());
    let merged = merge_json_boards(json, json).expect("merge");
    let value: Value = serde_json::from_str(&merged).unwrap();
    assert_eq!(value["nodes"], serde_json::json!([]));
    assert_eq!(value["edges"], serde_json::json!([]));
}

#[test]
fn concurrent_node_adds_keep_both() {
    let left = r#"{"nodes":[{"id":"a","kind":"rect"}],"edges":[]}"#;
    let right = r#"{"nodes":[{"id":"b","kind":"ellipse"}],"edges":[]}"#;
    let merged = merge_json_boards(left, right).expect("merge");
    let value: Value = serde_json::from_str(&merged).unwrap();
    let ids: Vec<&str> = value["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|n| n.get("id").and_then(Value::as_str))
        .collect();
    assert!(ids.contains(&"a"), "{merged}");
    assert!(ids.contains(&"b"), "{merged}");
}

#[test]
fn rejects_non_board_json() {
    assert!(snapshot_from_json("[]").is_err());
    assert!(snapshot_from_json(r#"{"nodes":[]}"#).is_err());
    assert!(snapshot_from_json("not-json").is_err());
}
