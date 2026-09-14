import { LoroDoc } from 'loro-crdt';

const STORAGE_KEY = 'conation:canvas-loro';
const MAX_DOCS = 40;
const MAX_UPDATES = 64;

export type CanvasLoroJson = {
  nodes?: unknown[];
  edges?: unknown[];
  groups?: unknown[];
};

type CanvasLoroRecord = {
  documentId: string;
  updates: string[];
  savedAt: number;
};

function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function b64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function entityId(item: unknown): string | undefined {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return;
  const id = (item as { id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
}

export type CanvasOp =
  | { op: 'upsertNode'; node: Record<string, unknown> }
  | { op: 'deleteNode'; id: string }
  | { op: 'moveNode'; id: string; x: number; y: number }
  | { op: 'updateNode'; id: string; patch: Record<string, unknown> }
  | { op: 'upsertEdge'; edge: Record<string, unknown> }
  | { op: 'deleteEdge'; id: string };

function upsertEntity(
  items: unknown[],
  item: Record<string, unknown>
): unknown[] {
  const id = entityId(item);
  if (!id) return items;
  const next = items.filter((entry) => entityId(entry) !== id);
  next.push(item);
  return next;
}

function deleteEntity(items: unknown[], id: string): unknown[] {
  return items.filter((entry) => entityId(entry) !== id);
}

function patchNode(
  items: unknown[],
  id: string,
  patch: Record<string, unknown>
): unknown[] {
  return items.map((entry) => {
    if (entityId(entry) !== id || !entry || typeof entry !== 'object') {
      return entry;
    }
    const { id: _ignored, ...rest } = patch;
    return { ...(entry as Record<string, unknown>), ...rest, id };
  });
}

function itemsById(
  items: unknown[] | undefined
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const item of items ?? []) {
    const id = entityId(item);
    if (!id || !item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    map.set(id, item as Record<string, unknown>);
  }
  return map;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readMapEntity(
  map: ReturnType<LoroDoc['getMap']>,
  id: string
): Record<string, unknown> | undefined {
  const raw = (map.toJSON() as Record<string, unknown>)?.[id];
  if (typeof raw !== 'string') return;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return;
  }
}

/** Diff two boards into editor/agent node-edge ops (untouched ids omitted). */
export function opsFromBoardDiff(
  previous: CanvasLoroJson,
  next: CanvasLoroJson
): CanvasOp[] {
  const ops: CanvasOp[] = [];
  const prevNodes = itemsById(previous.nodes);
  const nextNodes = itemsById(next.nodes);
  for (const [id, node] of nextNodes) {
    const prev = prevNodes.get(id);
    if (!prev) {
      ops.push({ op: 'upsertNode', node });
      continue;
    }
    if (sameJson(prev, node)) continue;
    ops.push({ op: 'upsertNode', node });
  }
  for (const id of prevNodes.keys()) {
    if (!nextNodes.has(id)) ops.push({ op: 'deleteNode', id });
  }

  const prevEdges = itemsById(previous.edges);
  const nextEdges = itemsById(next.edges);
  for (const [id, edge] of nextEdges) {
    const prev = prevEdges.get(id);
    if (!prev) {
      ops.push({ op: 'upsertEdge', edge });
      continue;
    }
    if (sameJson(prev, edge)) continue;
    ops.push({ op: 'upsertEdge', edge });
  }
  for (const id of prevEdges.keys()) {
    if (!nextEdges.has(id)) ops.push({ op: 'deleteEdge', id });
  }
  return ops;
}

/** Apply editor-style node/edge ops onto a board (agent + tests). */
export function applyCanvasOps(
  json: CanvasLoroJson,
  ops: CanvasOp[]
): CanvasLoroJson {
  let nodes = [...(json.nodes ?? [])];
  let edges = [...(json.edges ?? [])];
  for (const op of ops) {
    switch (op.op) {
      case 'upsertNode':
        nodes = upsertEntity(nodes, op.node);
        break;
      case 'deleteNode':
        nodes = deleteEntity(nodes, op.id);
        break;
      case 'moveNode':
        nodes = patchNode(nodes, op.id, { x: op.x, y: op.y });
        break;
      case 'updateNode':
        nodes = patchNode(nodes, op.id, op.patch);
        break;
      case 'upsertEdge':
        edges = upsertEntity(edges, op.edge);
        break;
      case 'deleteEdge':
        edges = deleteEntity(edges, op.id);
        break;
      default: {
        const _never: never = op;
        void _never;
      }
    }
  }
  return { ...json, nodes, edges };
}

/** Mutate only named Loro entities (same as agent `canvasOps` apply-update). */
export function applyCanvasOpsToDoc(doc: LoroDoc, ops: CanvasOp[]): void {
  const nodes = doc.getMap('nodes');
  const edges = doc.getMap('edges');
  for (const op of ops) {
    switch (op.op) {
      case 'upsertNode': {
        const id = entityId(op.node);
        if (id) nodes.set(id, JSON.stringify(op.node));
        break;
      }
      case 'deleteNode':
        nodes.delete(op.id);
        break;
      case 'moveNode': {
        const node = readMapEntity(nodes, op.id);
        if (node) {
          nodes.set(
            op.id,
            JSON.stringify({ ...node, x: op.x, y: op.y, id: op.id })
          );
        }
        break;
      }
      case 'updateNode': {
        const node = readMapEntity(nodes, op.id);
        if (node) {
          const { id: _ignored, ...rest } = op.patch;
          nodes.set(op.id, JSON.stringify({ ...node, ...rest, id: op.id }));
        }
        break;
      }
      case 'upsertEdge': {
        const id = entityId(op.edge);
        if (id) edges.set(id, JSON.stringify(op.edge));
        break;
      }
      case 'deleteEdge':
        edges.delete(op.id);
        break;
      default: {
        const _never: never = op;
        void _never;
      }
    }
  }
}

function applyDirtyGroups(
  doc: LoroDoc,
  previous: unknown[] | undefined,
  next: unknown[] | undefined
): void {
  const map = doc.getMap('groups');
  const prev = itemsById(previous);
  const nxt = itemsById(next);
  for (const [id, item] of nxt) {
    const prior = prev.get(id);
    if (prior && sameJson(prior, item)) continue;
    map.set(id, JSON.stringify(item));
  }
  for (const id of prev.keys()) {
    if (!nxt.has(id)) map.delete(id);
  }
}

function syncMap(map: ReturnType<LoroDoc['getMap']>, items: unknown[]): void {
  const keep = new Set<string>();
  for (const item of items) {
    const id = entityId(item);
    if (!id) continue;
    keep.add(id);
    map.set(id, JSON.stringify(item));
  }
  const existing = Object.keys((map.toJSON() as Record<string, unknown>) ?? {});
  for (const id of existing) {
    if (!keep.has(id)) map.delete(id);
  }
}

function applyBoard(doc: LoroDoc, json: CanvasLoroJson): void {
  syncMap(doc.getMap('nodes'), json.nodes ?? []);
  syncMap(doc.getMap('edges'), json.edges ?? []);
  if (json.groups) syncMap(doc.getMap('groups'), json.groups);
  doc.commit();
}

function mapToEntities(doc: LoroDoc, name: string): unknown[] {
  const raw = doc.getMap(name).toJSON() as Record<string, unknown>;
  const items: unknown[] = [];
  for (const value of Object.values(raw ?? {})) {
    if (typeof value !== 'string') continue;
    try {
      items.push(JSON.parse(value));
    } catch {
      /* skip corrupt entry */
    }
  }
  items.sort((a, b) => {
    const left = entityId(a) ?? '';
    const right = entityId(b) ?? '';
    return left.localeCompare(right);
  });
  return items;
}

export function boardFromDoc(doc: LoroDoc): CanvasLoroJson {
  return {
    nodes: mapToEntities(doc, 'nodes'),
    edges: mapToEntities(doc, 'edges'),
    groups: mapToEntities(doc, 'groups'),
  };
}

/** Encode a board as a Loro snapshot for sync-service initialize. */
export function snapshotFromJson(json: CanvasLoroJson): Uint8Array {
  const doc = new LoroDoc();
  doc.setPeerId(1n);
  applyBoard(doc, json);
  return doc.export({ mode: 'snapshot' });
}

/** Encode one peer's board as a Loro update. */
export function encodeCanvasLoroUpdate(
  json: CanvasLoroJson,
  peerId: bigint
): Uint8Array {
  const doc = new LoroDoc();
  doc.setPeerId(peerId);
  applyBoard(doc, json);
  return doc.export({ mode: 'update' });
}

/**
 * Replay prior updates, apply dirty node/edge ops (and dirty groups), and
 * export the incremental Loro update. Whole-board `applyBoard` is the
 * fallback when there is no prior WAL to diff against.
 */
export function encodeCanvasLoroDiff(
  previousUpdates: Uint8Array[],
  json: CanvasLoroJson,
  peerId: bigint
): Uint8Array {
  const doc = new LoroDoc();
  doc.setPeerId(peerId);
  for (const update of previousUpdates) {
    doc.import(update);
  }
  const from = doc.version();
  if (previousUpdates.length === 0) {
    applyBoard(doc, json);
    return doc.export({ mode: 'update', from });
  }
  const previous = boardFromDoc(doc);
  applyCanvasOpsToDoc(doc, opsFromBoardDiff(previous, json));
  if (json.groups) applyDirtyGroups(doc, previous.groups, json.groups);
  doc.commit();
  return doc.export({ mode: 'update', from });
}

/** Import Loro updates from independent peers and export merged board JSON. */
export function mergeCanvasLoroUpdates(updates: Uint8Array[]): CanvasLoroJson {
  const doc = new LoroDoc();
  for (const update of updates) {
    doc.import(update);
  }
  return boardFromDoc(doc);
}

export function mergeCanvasBoards(
  left: CanvasLoroJson,
  right: CanvasLoroJson
): CanvasLoroJson {
  return mergeCanvasLoroUpdates([
    encodeCanvasLoroUpdate(left, 1n),
    encodeCanvasLoroUpdate(right, 2n),
  ]);
}

function readStore(): Record<string, CanvasLoroRecord> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, CanvasLoroRecord>;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, CanvasLoroRecord>): boolean {
  if (typeof localStorage === 'undefined') return false;
  const entries = Object.values(store).sort((a, b) => b.savedAt - a.savedAt);
  const next: Record<string, CanvasLoroRecord> = {};
  for (const row of entries.slice(0, MAX_DOCS)) {
    next[row.documentId] = {
      ...row,
      updates: row.updates.slice(-MAX_UPDATES),
    };
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

function storedUpdates(documentId: string): Uint8Array[] {
  const row = readStore()[documentId];
  if (!row?.updates.length) return [];
  return row.updates.map(b64ToBytes);
}

/** Append a Loro update for this board so later peers can merge. */
export function recordCanvasLoro(
  documentId: string,
  json: CanvasLoroJson
): Uint8Array | null {
  if (!documentId) return null;
  const previous = storedUpdates(documentId);
  const update = encodeCanvasLoroDiff(
    previous,
    json,
    BigInt(Date.now() % Number.MAX_SAFE_INTEGER) || 1n
  );
  const store = readStore();
  const existing = store[documentId];
  store[documentId] = {
    documentId,
    updates: [...(existing?.updates ?? []), bytesToB64(update)],
    savedAt: Date.now(),
  };
  if (!writeStore(store)) return null;
  return update;
}

/** Merged board from persisted Loro updates, if any. */
export function peekCanvasLoro(documentId: string): CanvasLoroJson | null {
  const row = readStore()[documentId];
  if (!row?.updates.length) return null;
  const updates = row.updates.map(b64ToBytes);
  return mergeCanvasLoroUpdates(updates);
}

export function clearCanvasLoro(documentId: string): void {
  const store = readStore();
  if (!(documentId in store)) return;
  delete store[documentId];
  writeStore(store);
}

/** Test helper. */
export function clearAllCanvasLoro(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export function hasCanvasLoro(documentId: string): boolean {
  return (readStore()[documentId]?.updates.length ?? 0) > 0;
}
