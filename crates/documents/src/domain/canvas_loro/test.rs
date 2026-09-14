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

fn node_ids(json: &str) -> Vec<String> {
    let value: Value = serde_json::from_str(json).unwrap();
    value["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|n| n.get("id").and_then(Value::as_str).map(str::to_string))
        .collect()
}

#[test]
fn apply_ops_upsert_move_update_delete_node_and_edge() {
    let base = r#"{"nodes":[{"id":"a","kind":"rect","x":0,"y":0}],"edges":[]}"#;
    let json = apply_ops_to_json(
        base,
        &[
            CanvasOp::UpsertNode {
                node: serde_json::json!({"id":"b","kind":"ellipse","x":1,"y":2}),
            },
            CanvasOp::MoveNode {
                id: "a".into(),
                x: 10.0,
                y: 20.0,
            },
            CanvasOp::UpdateNode {
                id: "a".into(),
                patch: serde_json::json!({"kind":"diamond"})
                    .as_object()
                    .unwrap()
                    .clone(),
            },
            CanvasOp::UpsertEdge {
                edge: serde_json::json!({"id":"e1","from":"a","to":"b"}),
            },
        ],
    )
    .expect("ops");
    let value: Value = serde_json::from_str(&json).unwrap();
    assert_eq!(node_ids(&json), vec!["a".to_string(), "b".to_string()]);
    assert_eq!(value["nodes"][0]["x"], 10.0);
    assert_eq!(value["nodes"][0]["y"], 20.0);
    assert_eq!(value["nodes"][0]["kind"], "diamond");
    assert_eq!(value["edges"][0]["id"], "e1");

    let deleted = apply_ops_to_json(
        &json,
        &[
            CanvasOp::DeleteNode { id: "b".into() },
            CanvasOp::DeleteEdge { id: "e1".into() },
        ],
    )
    .expect("delete");
    let value: Value = serde_json::from_str(&deleted).unwrap();
    assert_eq!(node_ids(&deleted), vec!["a".to_string()]);
    assert_eq!(value["edges"], serde_json::json!([]));
}

#[test]
fn apply_ops_rejects_upsert_without_id() {
    let err = apply_ops_to_json(
        EMPTY_BOARD_JSON,
        &[CanvasOp::UpsertNode {
            node: serde_json::json!({"kind":"rect"}),
        }],
    )
    .expect_err("missing id");
    assert!(err.to_string().contains("id"), "{err}");
}

#[test]
fn loro_ops_update_does_not_drop_untouched_node() {
    let before = r#"{"nodes":[{"id":"a","kind":"keep"},{"id":"b","kind":"old"}],"edges":[]}"#;
    let snap = snapshot_from_json(before).expect("encode");
    let ops = [CanvasOp::UpdateNode {
        id: "b".into(),
        patch: serde_json::json!({"kind":"new"})
            .as_object()
            .unwrap()
            .clone(),
    }];
    let update = update_from_ops_onto_snapshot(&snap, &ops).expect("update");
    let merged =
        json_from_snapshot(&merge_snapshots(&snap, &update).expect("merge")).expect("json");
    let value: Value = serde_json::from_str(&merged).unwrap();
    let a = value["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["id"] == "a")
        .unwrap();
    let b = value["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["id"] == "b")
        .unwrap();
    assert_eq!(a["kind"], "keep", "{merged}");
    assert_eq!(b["kind"], "new", "{merged}");
}

#[test]
fn canvas_sync_seed_ops_applies_when_session_exists() {
    let before = r#"{"nodes":[{"id":"a"}],"edges":[]}"#;
    let snap = snapshot_from_json(before).expect("encode");
    let ops = [CanvasOp::UpsertNode {
        node: serde_json::json!({"id":"b"}),
    }];
    let after = apply_ops_to_json(before, &ops).expect("json");
    match canvas_sync_seed_ops(Some(&snap), &after, &ops).expect("seed") {
        CanvasSyncSeed::ApplyUpdate(update) => {
            let merged =
                json_from_snapshot(&merge_snapshots(&snap, &update).expect("merge")).expect("json");
            let ids = node_ids(&merged);
            assert!(ids.contains(&"a".to_string()), "{merged}");
            assert!(ids.contains(&"b".to_string()), "{merged}");
        }
        CanvasSyncSeed::Initialize(_) => panic!("existing snapshot must apply-update"),
    }
}

#[test]
fn loro_delete_op_tombstones_node() {
    let with_both =
        r#"{"nodes":[{"id":"a","kind":"rect"},{"id":"b","kind":"ellipse"}],"edges":[]}"#;
    let snap = snapshot_from_json(with_both).expect("encode");
    let ops = [CanvasOp::DeleteNode { id: "b".into() }];
    let update = update_from_ops_onto_snapshot(&snap, &ops).expect("update");
    let merged =
        json_from_snapshot(&merge_snapshots(&snap, &update).expect("merge")).expect("json");
    assert_eq!(node_ids(&merged), vec!["a".to_string()], "{merged}");
}

#[test]
fn canvas_dss_put_after_ops_writes_json_when_no_session() {
    assert_eq!(canvas_dss_put_after_ops(false), CanvasDssPut::Json);
}

#[test]
fn canvas_dss_put_after_ops_skips_when_live_snapshot() {
    assert_eq!(canvas_dss_put_after_ops(true), CanvasDssPut::Skip);
}
