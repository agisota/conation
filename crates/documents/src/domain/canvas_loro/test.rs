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

#[test]
fn apply_update_tombstones_deleted_node() {
    let with_both =
        r#"{"nodes":[{"id":"a","kind":"rect"},{"id":"b","kind":"ellipse"}],"edges":[]}"#;
    let without_b = r#"{"nodes":[{"id":"a","kind":"rect"}],"edges":[]}"#;
    let snap = snapshot_from_json(with_both).expect("encode");
    let update = update_from_json_onto_snapshot(&snap, without_b).expect("update");
    let merged =
        json_from_snapshot(&merge_snapshots(&snap, &update).expect("merge")).expect("json");
    let value: Value = serde_json::from_str(&merged).unwrap();
    let ids: Vec<&str> = value["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|n| n.get("id").and_then(Value::as_str))
        .collect();
    assert_eq!(ids, vec!["a"], "{merged}");
}

#[test]
fn canvas_sync_seed_initializes_when_snapshot_is_missing() {
    let json = r#"{"nodes":[{"id":"a"}],"edges":[]}"#;
    match canvas_sync_seed(None, json).expect("seed") {
        CanvasSyncSeed::Initialize(snapshot) => {
            let merged = json_from_snapshot(&snapshot).expect("json");
            let value: Value = serde_json::from_str(&merged).unwrap();
            let ids: Vec<&str> = value["nodes"]
                .as_array()
                .unwrap()
                .iter()
                .filter_map(|n| n.get("id").and_then(Value::as_str))
                .collect();
            assert_eq!(ids, vec!["a"], "{merged}");
        }
        CanvasSyncSeed::ApplyUpdate(_) => panic!("missing snapshot must initialize"),
    }
}

#[test]
fn canvas_sync_seed_applies_update_when_session_exists() {
    let before = r#"{"nodes":[{"id":"a"}],"edges":[]}"#;
    let after = r#"{"nodes":[{"id":"a"},{"id":"b"}],"edges":[]}"#;
    let snap = snapshot_from_json(before).expect("encode");
    match canvas_sync_seed(Some(&snap), after).expect("seed") {
        CanvasSyncSeed::ApplyUpdate(update) => {
            let merged =
                json_from_snapshot(&merge_snapshots(&snap, &update).expect("merge")).expect("json");
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
        CanvasSyncSeed::Initialize(_) => panic!("existing snapshot must apply-update"),
    }
}

#[test]
fn apply_update_tombstone_wins_over_stale_peer_snapshot() {
    let with_both = r#"{"nodes":[{"id":"a"},{"id":"b"}],"edges":[]}"#;
    let without_b = r#"{"nodes":[{"id":"a"}],"edges":[]}"#;
    let peer1 = snapshot_from_json_with_peer(with_both, 1).expect("p1");
    let delete_b = update_from_json_onto_snapshot_with_peer(&peer1, without_b, 1).expect("del");
    let peer2 = snapshot_from_json_with_peer(with_both, 2).expect("p2");
    let both = merge_snapshots(&peer1, &peer2).expect("both");
    let merged =
        json_from_snapshot(&merge_snapshots(&both, &delete_b).expect("merge")).expect("json");
    let value: Value = serde_json::from_str(&merged).unwrap();
    let ids: Vec<&str> = value["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|n| n.get("id").and_then(Value::as_str))
        .collect();
    assert!(ids.contains(&"a"), "{merged}");
    assert!(
        !ids.contains(&"b"),
        "tombstone should drop b even if a stale peer still has it: {merged}"
    );
}
