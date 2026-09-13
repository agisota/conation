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
 * Replay prior updates, upsert/delete against `json`, and export the
 * incremental Loro update (tombstones included).
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
  applyBoard(doc, json);
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
