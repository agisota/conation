//! Persist canvas `{nodes, edges}` JSON as a Loro CRDT so concurrent
//! board edits merge instead of last-write-wins on the whole file.

use std::borrow::Cow;
use std::collections::HashSet;

use loro::{ExportMode, LoroDoc, LoroValue};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

const NODES: &str = "nodes";
const EDGES: &str = "edges";
const GROUPS: &str = "groups";

/// Empty board matching Create canvas / CreateDocument.
pub const EMPTY_BOARD_JSON: &str = r#"{"nodes":[],"edges":[]}"#;

/// Failed to encode or merge a canvas Loro document.
#[derive(Debug, thiserror::Error)]
pub enum CanvasLoroError {
    /// JSON is not a canvas board object.
    #[error("canvas content must be a JSON object with nodes and edges arrays")]
    InvalidBoard,
    /// A node-level op is missing a required id or entity object.
    #[error("{0}")]
    InvalidOp(String),
    /// Loro encode/import failed.
    #[error("{0}")]
    Loro(String),
}

/// One node/edge mutation matching the human editor store
/// (`createNode` / `updateNode` / `delete` / `createEdge`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ai_tools", derive(schemars::JsonSchema))]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum CanvasOp {
    /// Insert or replace a node by `id` (editor `createNode` / full `updateNode`).
    UpsertNode {
        /// Node object; must include `id`.
        node: Value,
    },
    /// Remove a node by id (editor `delete`). Missing ids are a no-op.
    DeleteNode {
        /// Node id.
        id: String,
    },
    /// Set `x`/`y` on an existing node (editor move). Missing ids are a no-op.
    MoveNode {
        /// Node id.
        id: String,
        /// Board x.
        x: f64,
        /// Board y.
        y: f64,
    },
    /// Merge fields onto an existing node (editor `updateNode` patch).
    UpdateNode {
        /// Node id.
        id: String,
        /// Fields to merge; `id` in the patch is ignored.
        #[serde(default)]
        patch: Map<String, Value>,
    },
    /// Insert or replace an edge by `id` (editor `createEdge`).
    UpsertEdge {
        /// Edge object; must include `id`.
        edge: Value,
    },
    /// Remove an edge by id. Missing ids are a no-op.
    DeleteEdge {
        /// Edge id.
        id: String,
    },
}

/// Encode a canvas board as a Loro snapshot (peer 1).
pub fn snapshot_from_json(json: &str) -> Result<Vec<u8>, CanvasLoroError> {
    snapshot_from_json_with_peer(json, 1)
}

/// Encode a canvas board as a Loro snapshot from a specific peer.
pub fn snapshot_from_json_with_peer(json: &str, peer: u64) -> Result<Vec<u8>, CanvasLoroError> {
    let value: Value = serde_json::from_str(json).map_err(|_| CanvasLoroError::InvalidBoard)?;
    let doc = doc_from_board(&value, peer)?;
    doc.export(ExportMode::Snapshot)
        .map_err(|e| CanvasLoroError::Loro(e.to_string()))
}

/// Import two independently encoded boards and return merged canvas JSON.
///
/// Nodes/edges/groups are keyed by `id`, so two peers adding different
/// shapes keep both. Same-id keys last-write-win via Loro's map CRDT.
/// Removals only drop an entity when encoded as a Loro map delete
/// ([`update_from_json_onto_snapshot`]), not when a later snapshot simply
/// omits the id.
pub fn merge_json_boards(left: &str, right: &str) -> Result<String, CanvasLoroError> {
    let left_snap = snapshot_from_json_with_peer(left, 1)?;
    let right_snap = snapshot_from_json_with_peer(right, 2)?;
    json_from_snapshot(&merge_snapshots(&left_snap, &right_snap)?)
}

/// What sync-service needs so a canvas edit is visible on the live WS.
#[derive(Debug)]
pub enum CanvasSyncSeed {
    /// No Loro session yet — POST `/initialize`.
    Initialize(Vec<u8>),
    /// Session already exists — POST incremental `/apply`.
    ApplyUpdate(Vec<u8>),
}

/// Encode an initialize snapshot or an incremental apply-update.
///
/// Boards that never got `initialize_from_snapshot` take the initialize
/// path. Later agent overwrites take apply-update so live peers see the
/// same ops the editor `pushUpdate`s.
pub fn canvas_sync_seed(
    existing_snapshot: Option<&[u8]>,
    json: &str,
) -> Result<CanvasSyncSeed, CanvasLoroError> {
    match existing_snapshot {
        Some(snapshot) if !snapshot.is_empty() => Ok(CanvasSyncSeed::ApplyUpdate(
            update_from_json_onto_snapshot(snapshot, json)?,
        )),
        _ => Ok(CanvasSyncSeed::Initialize(snapshot_from_json(json)?)),
    }
}

/// Encode initialize vs apply-update for node-level ops.
///
/// When a session exists, only the named entities are upserted/deleted in
/// Loro — untouched nodes are not rewritten. Missing sessions initialize
/// from the already-applied board JSON.
pub fn canvas_sync_seed_ops(
    existing_snapshot: Option<&[u8]>,
    json: &str,
    ops: &[CanvasOp],
) -> Result<CanvasSyncSeed, CanvasLoroError> {
    match existing_snapshot {
        Some(snapshot) if !snapshot.is_empty() => Ok(CanvasSyncSeed::ApplyUpdate(
            update_from_ops_onto_snapshot(snapshot, ops)?,
        )),
        _ => Ok(CanvasSyncSeed::Initialize(snapshot_from_json(json)?)),
    }
}

/// Apply editor-style node/edge ops onto a canvas JSON board.
pub fn apply_ops_to_json(json: &str, ops: &[CanvasOp]) -> Result<String, CanvasLoroError> {
    let mut value: Value = serde_json::from_str(json).map_err(|_| CanvasLoroError::InvalidBoard)?;
    apply_ops_to_value(&mut value, ops)?;
    serde_json::to_string(&value).map_err(|e| CanvasLoroError::Loro(e.to_string()))
}

/// Apply ops onto an existing snapshot and export a Loro update.
pub fn update_from_ops_onto_snapshot(
    snapshot: &[u8],
    ops: &[CanvasOp],
) -> Result<Vec<u8>, CanvasLoroError> {
    update_from_ops_onto_snapshot_with_peer(snapshot, ops, 1)
}

/// [`update_from_ops_onto_snapshot`] with an explicit Loro peer id.
pub fn update_from_ops_onto_snapshot_with_peer(
    snapshot: &[u8],
    ops: &[CanvasOp],
    peer: u64,
) -> Result<Vec<u8>, CanvasLoroError> {
    let doc = LoroDoc::new();
    doc.set_peer_id(peer)
        .map_err(|e| CanvasLoroError::Loro(e.to_string()))?;
    doc.import(snapshot)
        .map_err(|e| CanvasLoroError::Loro(e.to_string()))?;
    let from = doc.oplog_vv();
    apply_ops_to_doc(&doc, ops)?;
    doc.commit();
    doc.export(ExportMode::Updates {
        from: Cow::Owned(from),
    })
    .map_err(|e| CanvasLoroError::Loro(e.to_string()))
}

/// Apply a later board onto an existing snapshot and export a Loro *update*
/// (the live WS payload after `initialize_from_snapshot`).
///
/// Entities present in `snapshot` but missing from `json` are deleted so
/// the tombstone merges with peers that still have the old shape.
pub fn update_from_json_onto_snapshot(
    snapshot: &[u8],
    json: &str,
) -> Result<Vec<u8>, CanvasLoroError> {
    update_from_json_onto_snapshot_with_peer(snapshot, json, 1)
}

/// [`update_from_json_onto_snapshot`] with an explicit Loro peer id.
pub fn update_from_json_onto_snapshot_with_peer(
    snapshot: &[u8],
    json: &str,
    peer: u64,
) -> Result<Vec<u8>, CanvasLoroError> {
    let value: Value = serde_json::from_str(json).map_err(|_| CanvasLoroError::InvalidBoard)?;
    let obj = value.as_object().ok_or(CanvasLoroError::InvalidBoard)?;
    if !obj.get(NODES).is_some_and(Value::is_array) || !obj.get(EDGES).is_some_and(Value::is_array)
    {
        return Err(CanvasLoroError::InvalidBoard);
    }

    let doc = LoroDoc::new();
    doc.set_peer_id(peer)
        .map_err(|e| CanvasLoroError::Loro(e.to_string()))?;
    doc.import(snapshot)
        .map_err(|e| CanvasLoroError::Loro(e.to_string()))?;
    let from = doc.oplog_vv();
    sync_entities(&doc, NODES, obj.get(NODES))?;
    sync_entities(&doc, EDGES, obj.get(EDGES))?;
    sync_entities(&doc, GROUPS, obj.get(GROUPS))?;
    doc.commit();
    doc.export(ExportMode::Updates {
        from: Cow::Owned(from),
    })
    .map_err(|e| CanvasLoroError::Loro(e.to_string()))
}

fn merge_snapshots(left: &[u8], right: &[u8]) -> Result<Vec<u8>, CanvasLoroError> {
    let doc = LoroDoc::new();
    doc.import(left)
        .map_err(|e| CanvasLoroError::Loro(e.to_string()))?;
    doc.import(right)
        .map_err(|e| CanvasLoroError::Loro(e.to_string()))?;
    doc.export(ExportMode::Snapshot)
        .map_err(|e| CanvasLoroError::Loro(e.to_string()))
}

pub(crate) fn json_from_snapshot(snapshot: &[u8]) -> Result<String, CanvasLoroError> {
    let doc = LoroDoc::new();
    doc.import(snapshot)
        .map_err(|e| CanvasLoroError::Loro(e.to_string()))?;
    let board = board_from_doc(&doc)?;
    serde_json::to_string(&board).map_err(|e| CanvasLoroError::Loro(e.to_string()))
}

fn doc_from_board(value: &Value, peer: u64) -> Result<LoroDoc, CanvasLoroError> {
    let obj = value.as_object().ok_or(CanvasLoroError::InvalidBoard)?;
    if !obj.get(NODES).is_some_and(Value::is_array) || !obj.get(EDGES).is_some_and(Value::is_array)
    {
        return Err(CanvasLoroError::InvalidBoard);
    }

    let doc = LoroDoc::new();
    doc.set_peer_id(peer)
        .map_err(|e| CanvasLoroError::Loro(e.to_string()))?;
    sync_entities(&doc, NODES, obj.get(NODES))?;
    sync_entities(&doc, EDGES, obj.get(EDGES))?;
    sync_entities(&doc, GROUPS, obj.get(GROUPS))?;
    doc.commit();
    Ok(doc)
}

fn sync_entities(
    doc: &LoroDoc,
    container: &str,
    value: Option<&Value>,
) -> Result<(), CanvasLoroError> {
    let Some(items) = value.and_then(Value::as_array) else {
        return Ok(());
    };
    let map = doc.get_map(container);
    let mut keep = HashSet::new();
    for item in items {
        let id = item
            .get("id")
            .and_then(Value::as_str)
            .ok_or(CanvasLoroError::InvalidBoard)?;
        keep.insert(id.to_string());
        map.insert(id, item.to_string())
            .map_err(|e| CanvasLoroError::Loro(e.to_string()))?;
    }
    let existing = match map.get_deep_value() {
        LoroValue::Map(entries) => entries
            .iter()
            .map(|(id, _)| id.to_string())
            .collect::<Vec<_>>(),
        _ => Vec::new(),
    };
    for id in existing {
        if !keep.contains(&id) {
            map.delete(&id)
                .map_err(|e| CanvasLoroError::Loro(e.to_string()))?;
        }
    }
    Ok(())
}

fn require_board_arrays(value: &Value) -> Result<(), CanvasLoroError> {
    let obj = value.as_object().ok_or(CanvasLoroError::InvalidBoard)?;
    if !obj.get(NODES).is_some_and(Value::is_array) || !obj.get(EDGES).is_some_and(Value::is_array)
    {
        return Err(CanvasLoroError::InvalidBoard);
    }
    Ok(())
}

fn entity_id(item: &Value) -> Result<&str, CanvasLoroError> {
    item.get("id").and_then(Value::as_str).ok_or_else(|| {
        CanvasLoroError::InvalidOp("canvas op entity must include a string id".to_string())
    })
}

fn json_number(value: f64) -> Value {
    Value::Number(serde_json::Number::from_f64(value).unwrap_or_else(|| 0.into()))
}

fn upsert_entity(items: &mut Vec<Value>, item: Value) -> Result<(), CanvasLoroError> {
    let id = entity_id(&item)?.to_string();
    if let Some(existing) = items
        .iter_mut()
        .find(|n| n.get("id").and_then(Value::as_str) == Some(id.as_str()))
    {
        *existing = item;
    } else {
        items.push(item);
    }
    Ok(())
}

fn delete_entity(items: &mut Vec<Value>, id: &str) {
    items.retain(|n| n.get("id").and_then(Value::as_str) != Some(id));
}

fn apply_ops_to_value(value: &mut Value, ops: &[CanvasOp]) -> Result<(), CanvasLoroError> {
    require_board_arrays(value)?;
    let obj = value.as_object_mut().ok_or(CanvasLoroError::InvalidBoard)?;
    for op in ops {
        match op {
            CanvasOp::UpsertNode { node } => {
                let items = obj
                    .get_mut(NODES)
                    .and_then(Value::as_array_mut)
                    .ok_or(CanvasLoroError::InvalidBoard)?;
                upsert_entity(items, node.clone())?;
            }
            CanvasOp::DeleteNode { id } => {
                let items = obj
                    .get_mut(NODES)
                    .and_then(Value::as_array_mut)
                    .ok_or(CanvasLoroError::InvalidBoard)?;
                delete_entity(items, id);
            }
            CanvasOp::MoveNode { id, x, y } => {
                let items = obj
                    .get_mut(NODES)
                    .and_then(Value::as_array_mut)
                    .ok_or(CanvasLoroError::InvalidBoard)?;
                if let Some(node) = items
                    .iter_mut()
                    .find(|n| n.get("id").and_then(Value::as_str) == Some(id.as_str()))
                    && let Some(node) = node.as_object_mut()
                {
                    node.insert("x".to_string(), json_number(*x));
                    node.insert("y".to_string(), json_number(*y));
                }
            }
            CanvasOp::UpdateNode { id, patch } => {
                let items = obj
                    .get_mut(NODES)
                    .and_then(Value::as_array_mut)
                    .ok_or(CanvasLoroError::InvalidBoard)?;
                if let Some(node) = items
                    .iter_mut()
                    .find(|n| n.get("id").and_then(Value::as_str) == Some(id.as_str()))
                    && let Some(node) = node.as_object_mut()
                {
                    for (key, val) in patch {
                        if key == "id" {
                            continue;
                        }
                        node.insert(key.clone(), val.clone());
                    }
                }
            }
            CanvasOp::UpsertEdge { edge } => {
                let items = obj
                    .get_mut(EDGES)
                    .and_then(Value::as_array_mut)
                    .ok_or(CanvasLoroError::InvalidBoard)?;
                upsert_entity(items, edge.clone())?;
            }
            CanvasOp::DeleteEdge { id } => {
                let items = obj
                    .get_mut(EDGES)
                    .and_then(Value::as_array_mut)
                    .ok_or(CanvasLoroError::InvalidBoard)?;
                delete_entity(items, id);
            }
        }
    }
    Ok(())
}

fn entity_json(doc: &LoroDoc, container: &str, id: &str) -> Option<Value> {
    let LoroValue::Map(entries) = doc.get_map(container).get_deep_value() else {
        return None;
    };
    for (key, value) in entries.iter() {
        if key.as_str() != id {
            continue;
        }
        let LoroValue::String(raw) = value else {
            return None;
        };
        return serde_json::from_str(raw).ok();
    }
    None
}

fn upsert_map(doc: &LoroDoc, container: &str, item: &Value) -> Result<(), CanvasLoroError> {
    let id = entity_id(item)?;
    doc.get_map(container)
        .insert(id, item.to_string())
        .map_err(|e| CanvasLoroError::Loro(e.to_string()))
}

fn delete_map(doc: &LoroDoc, container: &str, id: &str) -> Result<(), CanvasLoroError> {
    doc.get_map(container)
        .delete(id)
        .map_err(|e| CanvasLoroError::Loro(e.to_string()))
}

fn apply_ops_to_doc(doc: &LoroDoc, ops: &[CanvasOp]) -> Result<(), CanvasLoroError> {
    for op in ops {
        match op {
            CanvasOp::UpsertNode { node } => upsert_map(doc, NODES, node)?,
            CanvasOp::DeleteNode { id } => delete_map(doc, NODES, id)?,
            CanvasOp::MoveNode { id, x, y } => {
                if let Some(mut node) = entity_json(doc, NODES, id)
                    && let Some(obj) = node.as_object_mut()
                {
                    obj.insert("x".to_string(), json_number(*x));
                    obj.insert("y".to_string(), json_number(*y));
                    upsert_map(doc, NODES, &Value::Object(obj.clone()))?;
                }
            }
            CanvasOp::UpdateNode { id, patch } => {
                if let Some(mut node) = entity_json(doc, NODES, id)
                    && let Some(obj) = node.as_object_mut()
                {
                    for (key, val) in patch {
                        if key == "id" {
                            continue;
                        }
                        obj.insert(key.clone(), val.clone());
                    }
                    upsert_map(doc, NODES, &Value::Object(obj.clone()))?;
                }
            }
            CanvasOp::UpsertEdge { edge } => upsert_map(doc, EDGES, edge)?,
            CanvasOp::DeleteEdge { id } => delete_map(doc, EDGES, id)?,
        }
    }
    Ok(())
}

fn board_from_doc(doc: &LoroDoc) -> Result<Value, CanvasLoroError> {
    let mut obj = Map::new();
    obj.insert(NODES.to_string(), entities_from_map(doc, NODES)?);
    obj.insert(EDGES.to_string(), entities_from_map(doc, EDGES)?);
    obj.insert(GROUPS.to_string(), entities_from_map(doc, GROUPS)?);
    Ok(Value::Object(obj))
}

fn entities_from_map(doc: &LoroDoc, container: &str) -> Result<Value, CanvasLoroError> {
    let LoroValue::Map(entries) = doc.get_map(container).get_deep_value() else {
        return Ok(Value::Array(Vec::new()));
    };
    let mut items = Vec::new();
    for (_id, value) in entries.iter() {
        let LoroValue::String(raw) = value else {
            continue;
        };
        if let Ok(parsed) = serde_json::from_str::<Value>(raw) {
            items.push(parsed);
        }
    }
    items.sort_by(|a, b| {
        a.get("id")
            .and_then(Value::as_str)
            .cmp(&b.get("id").and_then(Value::as_str))
    });
    Ok(Value::Array(items))
}

#[cfg(test)]
mod test;
