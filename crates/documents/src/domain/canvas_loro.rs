//! Persist canvas `{nodes, edges}` JSON as a Loro CRDT so concurrent
//! board edits merge instead of last-write-wins on the whole file.

use loro::{ExportMode, LoroDoc, LoroValue};
use serde_json::{Map, Value};

const NODES: &str = "nodes";
const EDGES: &str = "edges";
const GROUPS: &str = "groups";

/// Failed to encode or merge a canvas Loro document.
#[derive(Debug, thiserror::Error)]
pub enum CanvasLoroError {
    /// JSON is not a canvas board object.
    #[error("canvas content must be a JSON object with nodes and edges arrays")]
    InvalidBoard,
    /// Loro encode/import failed.
    #[error("{0}")]
    Loro(String),
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
pub fn merge_json_boards(left: &str, right: &str) -> Result<String, CanvasLoroError> {
    let left_snap = snapshot_from_json_with_peer(left, 1)?;
    let right_snap = snapshot_from_json_with_peer(right, 2)?;
    json_from_snapshot(&merge_snapshots(&left_snap, &right_snap)?)
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

fn json_from_snapshot(snapshot: &[u8]) -> Result<String, CanvasLoroError> {
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
    insert_entities(&doc, NODES, obj.get(NODES))?;
    insert_entities(&doc, EDGES, obj.get(EDGES))?;
    insert_entities(&doc, GROUPS, obj.get(GROUPS))?;
    doc.commit();
    Ok(doc)
}

fn insert_entities(
    doc: &LoroDoc,
    container: &str,
    value: Option<&Value>,
) -> Result<(), CanvasLoroError> {
    let Some(items) = value.and_then(Value::as_array) else {
        return Ok(());
    };
    let map = doc.get_map(container);
    for item in items {
        let id = item
            .get("id")
            .and_then(Value::as_str)
            .ok_or(CanvasLoroError::InvalidBoard)?;
        map.insert(id, item.to_string())
            .map_err(|e| CanvasLoroError::Loro(e.to_string()))?;
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
